import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { startExploration } from "@/lib/browser-automation/client"
import { connectDB } from "@/lib/db/mongoose"
import { extractDomain, type IWebsiteKnowledge, WebsiteKnowledge } from "@/lib/models/website-knowledge"

/**
 * POST /api/website-knowledge - Create and start a website knowledge exploration
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    websiteUrl: string
    organizationId: string
    maxPages?: number
    maxDepth?: number
    strategy?: "BFS" | "DFS"
    name?: string
    description?: string
    includePaths?: string[]
    excludePaths?: string[]
    websiteCredentials?: {
      username: string
      password: string
    }
  }

  const {
    websiteUrl,
    organizationId,
    maxPages,
    maxDepth,
    strategy,
    name,
    description,
    includePaths,
    excludePaths,
    websiteCredentials,
  } = body

  // Validate URL
  try {
    new URL(websiteUrl)
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
  }

  // Verify organization access
  // Note: Organization access is verified by Better Auth middleware
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 })
  }

  try {
    await connectDB()

    const domain = extractDomain(websiteUrl)

    console.log("[Website Knowledge] Starting exploration", {
      websiteUrl,
      domain,
      organizationId,
      maxPages,
      maxDepth: maxDepth || 3,
      strategy: strategy || "BFS",
      includePaths,
      excludePaths,
      hasAuthentication: !!websiteCredentials,
      userId: session.user.id,
    })

    // Check if knowledge already exists for this exact URL (not just domain)
    // Allow multiple entries for the same domain but different URLs
    const existing = await (WebsiteKnowledge as any).findOne({
      organizationId,
      websiteUrl: websiteUrl,
      status: { $in: ["pending", "exploring"] },
    })

    if (existing) {
      console.log("[Website Knowledge] Already exists for URL", {
        websiteUrl,
        existingId: existing._id.toString(),
        existingStatus: existing.status,
        organizationId,
      })
      return NextResponse.json(
        {
          data: {
            id: existing._id.toString(),
            websiteUrl: existing.websiteUrl,
            websiteDomain: existing.websiteDomain,
            status: existing.status,
            explorationJobId: existing.explorationJobId,
            message: "Website knowledge already exists for this URL and is currently being processed",
          },
        },
        { status: 200 }
      )
    }

    // Start exploration job
    let explorationJobId: string | null = null
    let status: "pending" | "exploring" | "failed" = "pending"

    try {
      console.log("[Website Knowledge] PIPELINE STEP: Starting browser automation exploration", {
        websiteUrl,
        maxPages: maxPages || 100,
        maxDepth: maxDepth || 10,
        strategy: strategy || "BFS",
        includePaths,
        excludePaths,
        hasAuthentication: !!websiteCredentials,
        organizationId,
        stage: "exploration_start",
      })

      const explorationResponse = await startExploration({
        start_url: websiteUrl,
        max_pages: maxPages || 100,
        max_depth: maxDepth || 10,
        strategy: strategy || "BFS",
        include_paths: includePaths,
        exclude_paths: excludePaths,
        authentication: websiteCredentials &&
          websiteCredentials.username?.trim() &&
          websiteCredentials.password?.trim()
          ? {
              username: websiteCredentials.username.trim(),
              password: websiteCredentials.password.trim(),
            }
          : undefined,
      })
      
      // CRITICAL: Validate exploration response
      if (!explorationResponse.job_id) {
        const error = "Browser automation service returned job without job_id"
        console.error("[Website Knowledge] CRITICAL FAILURE - Invalid exploration response", {
          websiteUrl,
          organizationId,
          error,
          response: explorationResponse,
        })
        Sentry.captureMessage("Browser automation exploration response missing job_id", {
          level: "error",
          tags: {
            operation: "start_exploration",
            websiteUrl,
            organizationId,
            failure_type: "missing_job_id",
          },
          extra: {
            websiteUrl,
            organizationId,
            response: explorationResponse,
          },
        })
        throw new Error(error)
      }
      
      explorationJobId = explorationResponse.job_id
      status = explorationResponse.status === "queued" ? "pending" : "exploring"

      console.log("[Website Knowledge] PIPELINE STEP: Exploration job started successfully", {
        jobId: explorationJobId,
        status: explorationResponse.status,
        websiteUrl,
        organizationId,
        stage: "exploration_started",
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("[Website Knowledge] Failed to start exploration job", {
        websiteUrl,
        organizationId,
        error: errorMessage,
        maxPages,
        maxDepth: maxDepth || 3,
        strategy: strategy || "BFS",
      })
      Sentry.captureException(error, {
        tags: {
          operation: "start_exploration",
          websiteUrl,
          organizationId,
        },
        extra: {
          maxPages,
          maxDepth: maxDepth || 3,
          strategy: strategy || "BFS",
          includePaths,
          excludePaths,
        },
      })
      status = "failed"
    }

    // Create initial sync run for history
    const initialSyncRun = {
      jobId: explorationJobId || "",
      status,
      triggerType: "initial" as const,
      startedAt: new Date(),
      completedAt: undefined,
      pagesProcessed: undefined,
      linksProcessed: undefined,
      errorCount: undefined,
    }

    // Create website knowledge record
    // Note: Credentials should be encrypted before storage in production
    // For now, storing as-is (encryption should be added at application layer)
    const websiteKnowledge = await (WebsiteKnowledge as any).create({
      organizationId,
      websiteUrl,
      websiteDomain: domain,
      explorationJobId,
      status,
      websiteCredentials: websiteCredentials
        ? {
            username: websiteCredentials.username,
            password: websiteCredentials.password, // TODO: Encrypt before storage
          }
        : undefined,
      maxPages: maxPages || 100,
      maxDepth: maxDepth || 10,
      strategy: strategy || "BFS",
      includePaths: includePaths && includePaths.length > 0 ? includePaths : undefined,
      excludePaths: excludePaths && excludePaths.length > 0 ? excludePaths : undefined,
      name: name || `${domain} - Website Knowledge`,
      description,
      startedAt: status !== "failed" ? new Date() : undefined,
      syncHistory: [initialSyncRun],
    })

    console.log("[Website Knowledge] Record created", {
      knowledgeId: websiteKnowledge._id.toString(),
      jobId: explorationJobId,
      status,
      websiteUrl,
      organizationId,
    })

    return NextResponse.json({
      data: {
        id: websiteKnowledge._id.toString(),
        websiteUrl: websiteKnowledge.websiteUrl,
        websiteDomain: websiteKnowledge.websiteDomain,
        status: websiteKnowledge.status,
        explorationJobId: websiteKnowledge.explorationJobId,
        createdAt: websiteKnowledge.createdAt,
      },
    })
  } catch (error: unknown) {
    console.error("[Website Knowledge] Creation error", {
      websiteUrl,
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    })
    Sentry.captureException(error, {
      tags: {
        operation: "create_website_knowledge",
        websiteUrl,
        organizationId,
      },
    })
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to create website knowledge" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/website-knowledge - List website knowledge for an organization
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const organizationId = searchParams.get("organizationId")
  const status = searchParams.get("status")
  const websiteDomain = searchParams.get("websiteDomain")
  const page = parseInt(searchParams.get("page") || "1", 10)
  const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10), 100) // Max 100, default 25

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 })
  }

  try {
    await connectDB()

    const query: {
      organizationId: string
      status?: "pending" | "exploring" | "completed" | "failed" | "cancelled"
      websiteDomain?: string
    } = {
      organizationId,
    }

    if (status) {
      query.status = status as "pending" | "exploring" | "completed" | "failed" | "cancelled"
    }

    if (websiteDomain) {
      query.websiteDomain = websiteDomain
    }

    // Get total count for pagination
    const totalCount = await (WebsiteKnowledge as any).countDocuments(query)

    // Calculate pagination
    const skip = (page - 1) * limit
    const totalPages = Math.ceil(totalCount / limit)

    const knowledgeList = await (WebsiteKnowledge as any)
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    console.log("[Website Knowledge] List query", {
      organizationId,
      status,
      query,
      totalCount,
      returnedCount: knowledgeList.length,
      page,
      limit,
    })

    return NextResponse.json({
      data: knowledgeList.map((item: IWebsiteKnowledge) => ({
        id: item._id.toString(),
        websiteUrl: item.websiteUrl,
        websiteDomain: item.websiteDomain,
        status: item.status,
        explorationJobId: item.explorationJobId,
        maxPages: item.maxPages,
        maxDepth: item.maxDepth,
        strategy: item.strategy,
        includePaths: item.includePaths,
        excludePaths: item.excludePaths,
        pagesStored: item.pagesStored,
        linksStored: item.linksStored,
        externalLinksDetected: item.externalLinksDetected,
        name: item.name,
        description: item.description,
        tags: item.tags,
        timesReferenced: item.timesReferenced,
        lastReferencedAt: item.lastReferencedAt,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    })
  } catch (error: unknown) {
    console.error("Website knowledge list error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to list website knowledge" },
      { status: 500 }
    )
  }
}

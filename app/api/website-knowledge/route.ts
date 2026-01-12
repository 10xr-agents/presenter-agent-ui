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

    // Check if knowledge already exists for this domain
    const existing = await (WebsiteKnowledge as any).findOne({
      organizationId,
      websiteDomain: domain,
      status: { $in: ["exploring", "completed"] },
    })

    if (existing) {
      return NextResponse.json(
        {
          data: {
            id: existing._id.toString(),
            websiteUrl: existing.websiteUrl,
            websiteDomain: existing.websiteDomain,
            status: existing.status,
            explorationJobId: existing.explorationJobId,
            message: "Website knowledge already exists for this domain",
          },
        },
        { status: 200 }
      )
    }

    // Start exploration job
    let explorationJobId: string | null = null
    let status: "pending" | "exploring" | "failed" = "pending"

    try {
      const explorationResponse = await startExploration({
        start_url: websiteUrl,
        max_pages: maxPages,
        max_depth: maxDepth || 3,
        strategy: strategy || "BFS",
        include_paths: includePaths,
        exclude_paths: excludePaths,
      })
      explorationJobId = explorationResponse.job_id
      status = explorationResponse.status === "queued" ? "pending" : "exploring"
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("Failed to start exploration:", errorMessage)
      status = "failed"
    }

    // Create website knowledge record
    const websiteKnowledge = await (WebsiteKnowledge as any).create({
      organizationId,
      websiteUrl,
      websiteDomain: domain,
      explorationJobId,
      status,
      maxPages,
      maxDepth: maxDepth || 3,
      strategy: strategy || "BFS",
      includePaths: includePaths && includePaths.length > 0 ? includePaths : undefined,
      excludePaths: excludePaths && excludePaths.length > 0 ? excludePaths : undefined,
      name: name || `${domain} - Website Knowledge`,
      description,
      startedAt: status !== "failed" ? new Date() : undefined,
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
    console.error("Website knowledge creation error:", error)
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

    const knowledgeList = await (WebsiteKnowledge as any)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)

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

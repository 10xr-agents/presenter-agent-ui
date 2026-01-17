import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeSource, type KnowledgeStatus, type KnowledgeSourceType } from "@/lib/models/knowledge-source"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"
import { startIngestion, uploadIngestion, type SourceType } from "@/lib/knowledge-extraction/client"

/**
 * POST /api/knowledge - Create and start a knowledge extraction workflow
 * Supports URL-based ingestion (documentation, website, video) and file uploads
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get tenant state and organization ID
  const tenantState = await getTenantState(session.user.id)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }
  
  // In normal mode, use user ID; in organization mode, use organization ID
  const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  try {
    await connectDB()

    // Check if this is a file upload (multipart/form-data) or JSON request
    const contentType = req.headers.get("content-type") || ""
    
    if (contentType.includes("multipart/form-data")) {
      // Handle file upload
      const formData = await req.formData()
      const sourceType = formData.get("source_type") as "documentation" | "video"
      const sourceName = formData.get("source_name") as string
      const file = formData.get("file") as File | null
      const name = formData.get("name") as string | null
      const description = formData.get("description") as string | null

      if (!sourceType || !sourceName || !file) {
        return NextResponse.json(
          { error: "source_type, source_name, and file are required" },
          { status: 400 }
        )
      }

      // Validate file type
      const allowedDocTypes = [".md", ".pdf", ".txt", ".html"]
      const allowedVideoTypes = [".mp4", ".mov", ".avi", ".webm"]
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."))
      
      if (sourceType === "documentation" && !allowedDocTypes.includes(fileExtension)) {
        return NextResponse.json(
          { error: `Invalid file type for documentation. Allowed: ${allowedDocTypes.join(", ")}` },
          { status: 400 }
        )
      }
      
      if (sourceType === "video" && !allowedVideoTypes.includes(fileExtension)) {
        return NextResponse.json(
          { error: `Invalid file type for video. Allowed: ${allowedVideoTypes.join(", ")}` },
          { status: 400 }
        )
      }

      // Validate file size
      const maxSize = sourceType === "documentation" ? 50 * 1024 * 1024 : 500 * 1024 * 1024 // 50MB or 500MB
      if (file.size > maxSize) {
        return NextResponse.json(
          { error: `File size exceeds limit (max: ${maxSize / 1024 / 1024}MB)` },
          { status: 413 }
        )
      }

      console.log("[Knowledge] Starting file upload ingestion", {
        sourceType,
        sourceName,
        fileName: file.name,
        fileSize: file.size,
        organizationId: knowledgeOrgId,
      })

      try {
        // Call knowledge extraction API
        const ingestionResponse = await uploadIngestion({
          source_type: sourceType,
          source_name: sourceName,
          file,
        })

        // Create knowledge source record
        const initialSyncRun = {
          jobId: ingestionResponse.job_id,
          workflowId: ingestionResponse.workflow_id,
          status: "queued" as const,
          triggerType: "initial" as const,
          startedAt: new Date(),
          phase: undefined,
          progress: 0,
          errorMessages: [], // Renamed from 'errors' to avoid Mongoose reserved pathname
          warnings: [],
        }

        const knowledgeSource = await (KnowledgeSource as any).create({
          organizationId: knowledgeOrgId,
          sourceType: sourceType === "documentation" ? "file" : "file", // Store as "file" type
          sourceName,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          jobId: ingestionResponse.job_id,
          workflowId: ingestionResponse.workflow_id,
          status: "queued",
          name: name || sourceName,
          description: description || undefined,
          startedAt: new Date(),
          syncHistory: [initialSyncRun],
        })

        console.log("[Knowledge] File upload record created", {
          knowledgeId: knowledgeSource._id.toString(),
          jobId: ingestionResponse.job_id,
          sourceType,
        })

        return NextResponse.json({
          data: {
            id: knowledgeSource._id.toString(),
            sourceType: knowledgeSource.sourceType,
            sourceName: knowledgeSource.sourceName,
            fileName: knowledgeSource.fileName,
            status: knowledgeSource.status,
            jobId: knowledgeSource.jobId,
            workflowId: knowledgeSource.workflowId,
            createdAt: knowledgeSource.createdAt,
          },
        })
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error("[Knowledge] Failed to upload file", {
          sourceType,
          sourceName,
          error: errorMessage,
        })
        Sentry.captureException(error, {
          tags: {
            operation: "upload_knowledge_file",
            sourceType,
            organizationId: knowledgeOrgId,
          },
        })
        return NextResponse.json(
          { error: errorMessage || "Failed to upload file" },
          { status: 500 }
        )
      }
    } else {
      // Handle URL-based ingestion (JSON)
      const body = (await req.json()) as {
        source_type: SourceType
        source_url: string
        source_name?: string
        name?: string
        description?: string
        options?: {
          max_pages?: number
          max_depth?: number
          extract_code_blocks?: boolean
          extract_thumbnails?: boolean
        }
        websiteCredentials?: {
          username: string
          password: string
        }
      }

      const {
        source_type,
        source_url,
        source_name,
        name,
        description,
        options,
        websiteCredentials,
      } = body

      // Validate URL
      try {
        new URL(source_url)
      } catch {
        return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
      }

      if (!source_type || !["documentation", "website", "video"].includes(source_type)) {
        return NextResponse.json(
          { error: "source_type must be 'documentation', 'website', or 'video'" },
          { status: 400 }
        )
      }

      console.log("[Knowledge] Starting URL-based ingestion", {
        sourceType: source_type,
        sourceUrl: source_url,
        sourceName: source_name,
        organizationId: knowledgeOrgId,
        hasCredentials: !!websiteCredentials,
      })

      try {
        // Prepare ingestion request
        const ingestionRequest = {
          source_type,
          source_url,
          source_name: source_name || source_url,
          options: {
            ...(source_type === "website" && options?.max_pages ? { max_pages: options.max_pages } : {}),
            ...(source_type === "website" && options?.max_depth ? { max_depth: options.max_depth } : {}),
            ...(source_type === "documentation" && options?.extract_code_blocks !== undefined
              ? { extract_code_blocks: options.extract_code_blocks }
              : {}),
            ...(source_type === "video" && options?.extract_thumbnails !== undefined
              ? { extract_thumbnails: options.extract_thumbnails }
              : {}),
          },
        }

        // Call knowledge extraction API
        const ingestionResponse = await startIngestion(ingestionRequest)

        // Create knowledge source record
        const initialSyncRun = {
          jobId: ingestionResponse.job_id,
          workflowId: ingestionResponse.workflow_id,
          status: "queued" as const,
          triggerType: "initial" as const,
          startedAt: new Date(),
          phase: undefined,
          progress: 0,
          errorMessages: [], // Renamed from 'errors' to avoid Mongoose reserved pathname
          warnings: [],
        }

        const knowledgeSource = await (KnowledgeSource as any).create({
          organizationId: knowledgeOrgId,
          sourceType: source_type,
          sourceUrl: source_url,
          sourceName: source_name || source_url,
          jobId: ingestionResponse.job_id,
          workflowId: ingestionResponse.workflow_id,
          status: "queued",
          name: name || source_name || source_url,
          description: description || undefined,
          websiteCredentials: websiteCredentials
            ? {
                username: websiteCredentials.username,
                password: websiteCredentials.password, // TODO: Encrypt before storage
              }
            : undefined,
          options: options
            ? {
                maxPages: options.max_pages,
                maxDepth: options.max_depth,
                extractCodeBlocks: options.extract_code_blocks,
                extractThumbnails: options.extract_thumbnails,
              }
            : undefined,
          startedAt: new Date(),
          syncHistory: [initialSyncRun],
        })

        console.log("[Knowledge] URL-based record created", {
          knowledgeId: knowledgeSource._id.toString(),
          jobId: ingestionResponse.job_id,
          sourceType: source_type,
        })

        return NextResponse.json({
          data: {
            id: knowledgeSource._id.toString(),
            sourceType: knowledgeSource.sourceType,
            sourceUrl: knowledgeSource.sourceUrl,
            sourceName: knowledgeSource.sourceName,
            status: knowledgeSource.status,
            jobId: knowledgeSource.jobId,
            workflowId: knowledgeSource.workflowId,
            createdAt: knowledgeSource.createdAt,
          },
        })
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error("[Knowledge] Failed to start ingestion", {
          sourceType: source_type,
          sourceUrl: source_url,
          error: errorMessage,
        })
        Sentry.captureException(error, {
          tags: {
            operation: "start_knowledge_ingestion",
            sourceType: source_type,
            organizationId: knowledgeOrgId,
          },
        })
        return NextResponse.json(
          { error: errorMessage || "Failed to start knowledge extraction" },
          { status: 500 }
        )
      }
    }
  } catch (error: unknown) {
    console.error("Knowledge creation error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, {
      tags: {
        operation: "create_knowledge",
        organizationId: knowledgeOrgId,
      },
    })
    return NextResponse.json(
      { error: errorMessage || "Failed to create knowledge" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/knowledge - List knowledge sources
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get tenant state and organization ID
  const tenantState = await getTenantState(session.user.id)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }
  
  // In normal mode, use user ID; in organization mode, use organization ID
  const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get("page") || "1", 10)
  const limit = parseInt(searchParams.get("limit") || "25", 10)
  const status = searchParams.get("status") || "all"
  const sourceType = searchParams.get("sourceType") || "all"

  try {
    await connectDB()

    const query: {
      organizationId: string
      status?: KnowledgeStatus
      sourceType?: KnowledgeSourceType
    } = {
      organizationId: knowledgeOrgId,
    }

    if (status !== "all") {
      query.status = status as KnowledgeStatus
    }

    if (sourceType !== "all") {
      query.sourceType = sourceType as KnowledgeSourceType
    }

    // Get total count for pagination
    const totalCount = await (KnowledgeSource as any).countDocuments(query)

    // Calculate pagination
    const skip = (page - 1) * limit
    const totalPages = Math.ceil(totalCount / limit)

    const knowledgeList = await (KnowledgeSource as any)
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    // Serialize syncHistory to remove _id fields and convert dates
    const serializeSyncHistory = (syncHistory: unknown) => {
      if (!Array.isArray(syncHistory)) return []
      return syncHistory.map((sync: unknown) => {
        const s = sync as {
          _id?: unknown
          jobId?: unknown
          workflowId?: unknown
          status?: unknown
          triggerType?: unknown
          startedAt?: unknown
          completedAt?: unknown
          phase?: unknown
          progress?: unknown
          errorMessages?: unknown // Renamed from 'errors' to avoid Mongoose reserved pathname
          errors?: unknown // Keep for backward compatibility during migration
          warnings?: unknown
        }
        return {
          jobId: String(s.jobId || ""),
          workflowId: s.workflowId ? String(s.workflowId) : undefined,
          status: String(s.status || "pending"),
          triggerType: String(s.triggerType || "initial"),
          startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : (s.startedAt ? String(s.startedAt) : new Date().toISOString()),
          completedAt: s.completedAt instanceof Date ? s.completedAt.toISOString() : (s.completedAt ? String(s.completedAt) : undefined),
          phase: s.phase ? String(s.phase) : undefined,
          progress: typeof s.progress === "number" ? s.progress : undefined,
          errorMessages: Array.isArray(s.errorMessages) ? s.errorMessages.map((e) => String(e)) : (Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : []), // Support both old 'errors' and new 'errorMessages' for backward compatibility
          warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
        }
      })
    }

    return NextResponse.json({
      data: knowledgeList.map((item: unknown) => {
        const knowledge = item as {
          _id: { toString: () => string }
          sourceType: string
          sourceUrl?: string
          sourceName: string
          fileName?: string
          status: string
          jobId: string | null
          workflowId: string | null
          name?: string
          description?: string
          startedAt?: Date
          completedAt?: Date
          createdAt: Date
          updatedAt: Date
          syncHistory?: unknown[]
        }
        return {
          id: knowledge._id.toString(),
          sourceType: knowledge.sourceType,
          sourceUrl: knowledge.sourceUrl,
          sourceName: knowledge.sourceName,
          fileName: knowledge.fileName,
          status: knowledge.status,
          jobId: knowledge.jobId,
          workflowId: knowledge.workflowId,
          name: knowledge.name,
          description: knowledge.description,
          startedAt: knowledge.startedAt?.toISOString(),
          completedAt: knowledge.completedAt?.toISOString(),
          createdAt: knowledge.createdAt.toISOString(),
          updatedAt: knowledge.updatedAt.toISOString(),
          syncHistory: serializeSyncHistory(knowledge.syncHistory),
        }
      }),
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
    console.error("Knowledge list error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to list knowledge" },
      { status: 500 }
    )
  }
}

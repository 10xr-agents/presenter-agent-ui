import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { startIngestion } from "@/lib/knowledge-extraction/client"
import { KnowledgeSource, type KnowledgeSourceType, type KnowledgeStatus } from "@/lib/models/knowledge-source"
import {
  generatePresignedUrl,
  generateS3Key,
  getFileSizeLimit,
  uploadFileToS3,
  validateFileType,
} from "@/lib/storage/s3-client"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

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
  const tenantState = await getTenantOperatingMode(session.user.id)
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
      // Handle file upload - NEW FLOW: Upload to S3 first, then send S3 reference
      const formData = await req.formData()
      const sourceType = formData.get("source_type") as "documentation" | "video" | "audio" | "data"
      const sourceName = formData.get("source_name") as string
      const file = formData.get("file") as File | null
      const name = formData.get("name") as string | null
      const description = formData.get("description") as string | null
      const useS3 = formData.get("use_s3") !== "false" // Default to true, can be disabled for backward compatibility

      if (!sourceType || !sourceName || !file) {
        return NextResponse.json(
          { error: "source_type, source_name, and file are required" },
          { status: 400 }
        )
      }

      // Map source type to file category for validation
      const fileCategory = sourceType === "documentation" ? "documentation" 
        : sourceType === "video" ? "video"
        : sourceType === "audio" ? "audio"
        : "data"

      // Validate file type
      const allowedTypes: Record<string, string[]> = {
        documentation: [".pdf", ".md", ".txt", ".html", ".docx", ".pptx"],
        video: [".mp4", ".mov", ".avi", ".webm", ".mkv"],
        audio: [".mp3", ".wav", ".ogg", ".m4a"],
        data: [".yaml", ".yml", ".json", ".xml", ".js", ".ts", ".py", ".java", ".cpp"],
      }

      const allowedFileTypes = allowedTypes[fileCategory] || []
      if (!validateFileType(file.name, file.type, allowedFileTypes)) {
        return NextResponse.json(
          { error: `Invalid file type for ${sourceType}. Allowed: ${allowedFileTypes.join(", ")}` },
          { status: 400 }
        )
      }

      // Validate file size
      const maxSize = getFileSizeLimit(fileCategory)
      if (file.size > maxSize) {
        return NextResponse.json(
          { error: `File size exceeds limit (max: ${maxSize / 1024 / 1024}MB)` },
          { status: 413 }
        )
      }

      console.log("[Knowledge] Starting file upload (S3 flow)", {
        sourceType,
        sourceName,
        fileName: file.name,
        fileSize: file.size,
        useS3,
        organizationId: knowledgeOrgId,
      })

      try {
        let ingestionResponse
        let s3Reference: {
          bucket: string
          key: string
          region?: string
          endpoint?: string
          url?: string
        } | undefined
        let fileMetadata: {
          originalFilename: string
          size: number
          contentType: string
          uploadedAt: Date
        } | undefined

        // Generate actual knowledge ID upfront (MongoDB ObjectId) for S3 key
        // This ensures the S3 path uses the actual knowledge ID from the start
        const mongoose = await import("mongoose")
        const knowledgeIdObj = new mongoose.Types.ObjectId()
        const knowledgeId = knowledgeIdObj.toString()

        // Always use S3 flow (new format only)
        if (useS3) {
          // NEW FLOW: Upload to S3 first
          const s3Key = generateS3Key(knowledgeOrgId, knowledgeId, file.name)

          console.log("[Knowledge] Uploading file to S3", {
            s3Key,
            fileName: file.name,
            fileSize: file.size,
          })

          const uploadResult = await uploadFileToS3(
            file,
            s3Key,
            file.type,
            {
              "original-filename": file.name,
              "source-type": sourceType,
              "organization-id": knowledgeOrgId,
            }
          )

          s3Reference = uploadResult.s3Reference
          fileMetadata = uploadResult.fileMetadata

          console.log("[Knowledge] File uploaded to S3, starting ingestion with S3 reference", {
            s3Key,
            bucket: s3Reference.bucket,
          })

          // Generate presigned URL for browser automation service
          const { url: presignedUrl, expiresAt } = await generatePresignedUrl(s3Key, 3600)

          // Transform to new two-phase format
          const ingestionRequest = {
            // REQUIRED in new format. For file uploads, use a stable sentinel URL.
            website_url: "https://file.local",
            ...(sourceName ? { website_name: sourceName } : {}),
            s3_references: [
              {
                bucket: s3Reference.bucket,
                key: s3Reference.key,
                ...(s3Reference.region ? { region: s3Reference.region } : {}),
                ...(s3Reference.endpoint ? { endpoint: s3Reference.endpoint } : {}),
                presigned_url: presignedUrl,
                expires_at: expiresAt.toISOString(),
              } as {
                bucket: string
                key: string
                region?: string
                endpoint?: string
                presigned_url: string
                expires_at: string
              },
            ],
            file_metadata_list: [
              {
                filename: fileMetadata.originalFilename,
                size: fileMetadata.size,
                content_type: fileMetadata.contentType,
                uploaded_at: fileMetadata.uploadedAt.toISOString(),
              },
            ],
            knowledge_id: knowledgeId,
          }

          console.log("[Knowledge] Starting file ingestion with new two-phase format", {
            website_url: ingestionRequest.website_url,
            knowledge_id: ingestionRequest.knowledge_id,
            file_count: ingestionRequest.s3_references.length,
          })

          ingestionResponse = await startIngestion(ingestionRequest)
        } else {
          // S3 flow is required - old direct upload is no longer supported
          return NextResponse.json(
            { error: "File upload requires S3 flow. Set use_s3=true or use the new two-phase JSON format." },
            { status: 400 }
          )
        }

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

        const knowledgeSourceData: {
          organizationId: string
          sourceType: "file"
          sourceName: string
          fileName: string
          fileSize: number
          fileType: string
          jobId: string
          workflowId: string
          status: "queued"
          name?: string
          description?: string
          startedAt: Date
          syncHistory: Array<typeof initialSyncRun>
          s3Reference?: typeof s3Reference
          fileMetadata?: typeof fileMetadata
        } = {
          organizationId: knowledgeOrgId,
          sourceType: "file",
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
        }

        // Add S3 reference if available
        if (s3Reference && fileMetadata) {
          knowledgeSourceData.s3Reference = s3Reference
          knowledgeSourceData.fileMetadata = fileMetadata
        }

        // Create knowledge source with the pre-generated ID
        // Use the same ObjectId instance we created earlier
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose safety rule: cast model methods
        const knowledgeSource = await (KnowledgeSource as any).create({
          ...knowledgeSourceData,
          _id: knowledgeIdObj,
        })

        console.log("[Knowledge] File upload record created", {
          knowledgeId: knowledgeSource._id.toString(),
          jobId: ingestionResponse.job_id,
          sourceType,
          hasS3Reference: !!s3Reference,
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
            s3Reference: knowledgeSource.s3Reference,
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
      // Handle JSON request (must use new two-phase format per OpenAPI schema)
      const body = (await req.json()) as {
        // Two-phase format per OpenAPI schema - website_url is REQUIRED
        website_url: string // REQUIRED per OpenAPI
        website_name?: string
        credentials?: {
          username: string
          password: string
          login_url?: string
        }
        s3_references?: Array<{
          bucket: string
          key: string
          region?: string | null
          endpoint?: string | null
          presigned_url: string
          expires_at: string
        }>
        file_metadata_list?: Array<{
          filename: string
          size: number
          content_type: string
          uploaded_at: string
        }>
        documentation_urls?: string[]
        options?: {
          max_pages?: number
          max_depth?: number
          extract_code_blocks?: boolean
          extract_thumbnails?: boolean
        }
        knowledge_id?: string
        name?: string
        description?: string
      }

      // New two-phase format per OpenAPI schema - website_url is REQUIRED
      if (!body.website_url) {
        return NextResponse.json(
          { error: "website_url is required per OpenAPI schema" },
          { status: 400 }
        )
      }

      // NEW FORMAT: Two-phase knowledge extraction (per OpenAPI schema)
      const { website_url, website_name, credentials, s3_references, file_metadata_list, documentation_urls, options, knowledge_id, name, description } = body

      // Validate website_url format
      try {
        new URL(website_url)
      } catch {
        return NextResponse.json({ error: "Invalid website_url format" }, { status: 400 })
      }

        // Validate that at least one of files OR documentation URLs is provided
        if ((!s3_references || s3_references.length === 0) && (!documentation_urls || documentation_urls.length === 0)) {
          return NextResponse.json(
            { error: "At least one of s3_references (files) OR documentation_urls must be provided" },
            { status: 400 }
          )
        }

        // Validate s3_references and file_metadata_list match
        if (s3_references && file_metadata_list) {
          if (s3_references.length !== file_metadata_list.length) {
            return NextResponse.json(
              { error: "s3_references and file_metadata_list must have the same length" },
              { status: 400 }
            )
          }
        }

        console.log("[Knowledge] Starting two-phase knowledge extraction (new format)", {
          website_url,
          website_name,
          has_credentials: !!credentials,
          file_count: s3_references?.length || 0,
          documentation_url_count: documentation_urls?.length || 0,
          knowledge_id,
          organizationId: knowledgeOrgId,
        })

        try {
          // Generate knowledge ID upfront for persisting extracted knowledge
          const mongoose = await import("mongoose")
          const knowledgeIdObj = knowledge_id ? new mongoose.Types.ObjectId(knowledge_id) : new mongoose.Types.ObjectId()
          const finalKnowledgeId = knowledgeIdObj.toString()

          // Prepare new two-phase ingestion request
          // Normalize s3_references to remove null values (TypeScript requires string | undefined, not string | null)
          const normalizedS3References = s3_references?.map((ref) => ({
            bucket: ref.bucket,
            key: ref.key,
            presigned_url: ref.presigned_url,
            expires_at: ref.expires_at,
            ...(ref.region !== null && ref.region !== undefined ? { region: ref.region } : {}),
            ...(ref.endpoint !== null && ref.endpoint !== undefined ? { endpoint: ref.endpoint } : {}),
          }))

          const ingestionRequest = {
            website_url, // REQUIRED
            ...(website_name ? { website_name } : {}),
            ...(normalizedS3References && normalizedS3References.length > 0 ? { s3_references: normalizedS3References } : {}),
            ...(file_metadata_list && file_metadata_list.length > 0 ? { file_metadata_list } : {}),
            ...(documentation_urls && documentation_urls.length > 0 ? { documentation_urls } : {}),
            ...(credentials ? { credentials } : {}),
            ...(options ? { options } : {}),
            knowledge_id: finalKnowledgeId,
          }

          const ingestionResponse = await startIngestion(ingestionRequest)

          // Create knowledge source record using the pre-generated knowledge ID
          const initialSyncRun = {
            jobId: ingestionResponse.job_id,
            workflowId: ingestionResponse.workflow_id,
            status: "queued" as const,
            triggerType: "initial" as const,
            startedAt: new Date(),
            phase: undefined,
            progress: 0,
            errorMessages: [],
            warnings: [],
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose safety rule: cast model methods
          const knowledgeSource = await (KnowledgeSource as any).create({
            _id: knowledgeIdObj,
            organizationId: knowledgeOrgId,
            sourceType: "website", // Always "website" in new two-phase model
            sourceUrl: website_url,
            sourceName: website_name || website_url,
            ...(s3_references && s3_references.length > 0
              ? {
                  fileName: file_metadata_list?.map((m) => m.filename).join(", "),
                  fileSize: file_metadata_list?.reduce((sum: number, m) => sum + m.size, 0),
                  s3Reference: s3_references[0],
                  fileMetadata: file_metadata_list?.[0]
                    ? {
                        originalFilename: file_metadata_list[0].filename,
                        size: file_metadata_list[0].size,
                        contentType: file_metadata_list[0].content_type,
                        uploadedAt: new Date(file_metadata_list[0].uploaded_at),
                      }
                    : undefined,
                }
              : {}),
            jobId: ingestionResponse.job_id,
            workflowId: ingestionResponse.workflow_id,
            status: "queued",
            name: name || website_name || website_url,
            description: description || undefined,
            websiteCredentials: credentials
              ? {
                  username: credentials.username,
                  password: credentials.password, // TODO: Encrypt before storage
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

          console.log("[Knowledge] Two-phase knowledge extraction started", {
            knowledgeId: knowledgeSource._id.toString(),
            jobId: ingestionResponse.job_id,
            website_url,
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
          console.error("[Knowledge] Failed to start two-phase knowledge extraction", {
            website_url,
            error: errorMessage,
          })
          Sentry.captureException(error, {
            tags: {
              operation: "two_phase_knowledge_extraction",
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
  const tenantState = await getTenantOperatingMode(session.user.id)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose safety rule: cast model methods
    const totalCount = await (KnowledgeSource as any).countDocuments(query)

    // Calculate pagination
    const skip = (page - 1) * limit
    const totalPages = Math.ceil(totalCount / limit)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mongoose safety rule: cast model methods
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

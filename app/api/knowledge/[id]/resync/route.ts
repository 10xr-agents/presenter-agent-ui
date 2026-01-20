import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeSource } from "@/lib/models/knowledge-source"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"
import { startIngestion } from "@/lib/knowledge-extraction/client"
import { generatePresignedUrl } from "@/lib/storage/s3-client"

/**
 * POST /api/knowledge/[id]/resync - Re-sync an existing knowledge source
 * Starts a new knowledge extraction workflow for an existing knowledge source
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  try {
    await connectDB()

    // Get tenant state and organization ID
    const tenantState = await getTenantState(session.user.id)
    let organizationId: string | null = null
    if (tenantState === "organization") {
      organizationId = await getActiveOrganizationId()
    }
    
    // In normal mode, use user ID; in organization mode, use organization ID
    const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

    // Find the existing knowledge source
    const knowledge = await (KnowledgeSource as any).findById(id).lean()

    if (!knowledge) {
      return NextResponse.json({ error: "Knowledge source not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Don't allow resync if there's already an active extraction
    if (["pending", "queued", "running"].includes(knowledge.status)) {
      return NextResponse.json(
        { error: "Knowledge extraction is already in progress. Please wait for it to complete." },
        { status: 400 }
      )
    }

    // For file-based sources, require S3 reference
    if (knowledge.sourceType === "file") {
      if (!knowledge.s3Reference || !knowledge.s3Reference.bucket || !knowledge.s3Reference.key) {
        return NextResponse.json(
          { error: "File-based knowledge sources require S3 reference for resync" },
          { status: 400 }
        )
      }
    } else if (!knowledge.sourceUrl) {
      // For URL-based sources, require sourceUrl
      return NextResponse.json(
        { error: "URL-based knowledge sources require sourceUrl for resync" },
        { status: 400 }
      )
    }

    console.log("[Knowledge] Starting resync", {
      knowledgeId: id,
      sourceType: knowledge.sourceType,
      sourceUrl: knowledge.sourceUrl,
      organizationId: knowledgeOrgId,
    })

    try {
      let ingestionResponse

      // NEW FORMAT: Two-phase knowledge extraction requires website_url
      // Use sourceUrl as website_url (always present in new format, may be present in old format)
      if (!knowledge.sourceUrl) {
        return NextResponse.json(
          { error: "Cannot resync: knowledge source must have sourceUrl (website_url)" },
          { status: 400 }
        )
      }

      const websiteUrl = knowledge.sourceUrl

      // Check if we have file references (Phase 1)
      const hasS3Reference = knowledge.s3Reference && knowledge.s3Reference.bucket && knowledge.s3Reference.key
      const hasFileMetadata = knowledge.fileMetadata

      // Prepare new two-phase ingestion request
      const ingestionRequest: {
        website_url: string
        website_name?: string
        s3_references?: Array<{
          bucket: string
          key: string
          region?: string
          endpoint?: string
          presigned_url: string
          expires_at: string
        }>
        file_metadata_list?: Array<{
          filename: string
          size: number
          content_type: string
          uploaded_at: string
        }>
        credentials?: {
          username: string
          password: string
          login_url?: string
        }
        options?: {
          max_pages?: number
          max_depth?: number
          extract_code_blocks?: boolean
          extract_thumbnails?: boolean
        }
        knowledge_id: string
      } = {
        website_url: websiteUrl,
        ...(knowledge.sourceName ? { website_name: knowledge.sourceName } : {}),
        ...(hasS3Reference && hasFileMetadata
          ? (async () => {
              // Generate new presigned URL for resync
              const { url: presignedUrl, expiresAt } = await generatePresignedUrl(
                knowledge.s3Reference!.key,
                3600
              )
              return {
                s3_references: [
                  {
                    bucket: knowledge.s3Reference!.bucket,
                    key: knowledge.s3Reference!.key,
                    ...(knowledge.s3Reference!.region ? { region: knowledge.s3Reference!.region } : {}),
                    ...(knowledge.s3Reference!.endpoint ? { endpoint: knowledge.s3Reference!.endpoint } : {}),
                    presigned_url: presignedUrl,
                    expires_at: expiresAt.toISOString(),
                  },
                ],
                file_metadata_list: [
                  {
                    filename: knowledge.fileMetadata!.originalFilename,
                    size: knowledge.fileMetadata!.size,
                    content_type: knowledge.fileMetadata!.contentType,
                    uploaded_at:
                      knowledge.fileMetadata!.uploadedAt instanceof Date
                        ? knowledge.fileMetadata!.uploadedAt.toISOString()
                        : new Date(knowledge.fileMetadata!.uploadedAt).toISOString(),
                  },
                ],
              }
            })()
          : {}),
        ...(knowledge.websiteCredentials &&
        knowledge.websiteCredentials.username &&
        knowledge.websiteCredentials.password
          ? {
              credentials: {
                username: String(knowledge.websiteCredentials.username),
                password: String(knowledge.websiteCredentials.password),
              },
            }
          : {}),
        ...(knowledge.options
          ? {
              options: {
                ...(knowledge.options.maxPages ? { max_pages: knowledge.options.maxPages } : {}),
                ...(knowledge.options.maxDepth ? { max_depth: knowledge.options.maxDepth } : {}),
                ...(knowledge.options.extractCodeBlocks !== undefined
                  ? { extract_code_blocks: knowledge.options.extractCodeBlocks }
                  : {}),
                ...(knowledge.options.extractThumbnails !== undefined
                  ? { extract_thumbnails: knowledge.options.extractThumbnails }
                  : {}),
              },
            }
          : {}),
        knowledge_id: id,
      }

      // If we have file references, generate presigned URL first
      if (hasS3Reference && hasFileMetadata) {
        const { url: presignedUrl, expiresAt } = await generatePresignedUrl(
          knowledge.s3Reference!.key,
          3600
        )
        ingestionRequest.s3_references = [
          {
            bucket: knowledge.s3Reference!.bucket,
            key: knowledge.s3Reference!.key,
            ...(knowledge.s3Reference!.region ? { region: knowledge.s3Reference!.region } : {}),
            ...(knowledge.s3Reference!.endpoint ? { endpoint: knowledge.s3Reference!.endpoint } : {}),
            presigned_url: presignedUrl,
            expires_at: expiresAt.toISOString(),
          },
        ]
        ingestionRequest.file_metadata_list = [
          {
            filename: knowledge.fileMetadata!.originalFilename,
            size: knowledge.fileMetadata!.size,
            content_type: knowledge.fileMetadata!.contentType,
            uploaded_at:
              knowledge.fileMetadata!.uploadedAt instanceof Date
                ? knowledge.fileMetadata!.uploadedAt.toISOString()
                : new Date(knowledge.fileMetadata!.uploadedAt).toISOString(),
          },
        ]
      }

      ingestionResponse = await startIngestion(ingestionRequest)

      // Update knowledge source record
      const docToUpdate = await (KnowledgeSource as any).findById(id)
      if (docToUpdate) {
        // Update job tracking
        docToUpdate.jobId = ingestionResponse.job_id
        docToUpdate.workflowId = ingestionResponse.workflow_id
        docToUpdate.status = "queued"
        docToUpdate.startedAt = new Date()

        // Add new sync run to history
        const existingSyncHistory = Array.isArray(docToUpdate.syncHistory) 
          ? docToUpdate.syncHistory.map((sync: unknown) => {
              const s = sync as { jobId?: unknown; status?: unknown; [key: string]: unknown }
              return {
                jobId: String(s.jobId || ""),
                workflowId: s.workflowId ? String(s.workflowId) : undefined,
                status: String(s.status || "pending"),
                triggerType: String(s.triggerType || "initial"),
                startedAt: s.startedAt instanceof Date ? s.startedAt : (s.startedAt ? new Date(s.startedAt as string) : new Date()),
                completedAt: s.completedAt instanceof Date ? s.completedAt : (s.completedAt ? new Date(s.completedAt as string) : undefined),
                phase: s.phase ? String(s.phase) : undefined,
                progress: typeof s.progress === "number" ? s.progress : undefined,
                errors: Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : [],
                warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
                pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
                linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
                errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
              }
            })
          : []

        // Filter out invalid entries
        const validSyncHistory = existingSyncHistory.filter(
          (sync: { jobId: string; status: string; triggerType: string; startedAt: Date }) =>
            sync.jobId && sync.status && sync.triggerType && sync.startedAt
        )

        // Add new sync run
        const newSyncRun = {
          jobId: ingestionResponse.job_id,
          workflowId: ingestionResponse.workflow_id,
          status: "queued" as const,
          triggerType: "resync" as const,
          startedAt: new Date(),
          phase: undefined,
          progress: 0,
          errors: [],
          warnings: [],
        }

        docToUpdate.syncHistory = [...validSyncHistory, newSyncRun]
        await docToUpdate.save()
      }

      // Fetch fresh lean document for response
      const updatedKnowledge = await (KnowledgeSource as any).findById(id).lean()

      // Serialize syncHistory for response
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
            pagesProcessed?: unknown
            linksProcessed?: unknown
            errorCount?: unknown
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
            errors: Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : [],
            warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
            pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
            linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
            errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
          }
        })
      }

      console.log("[Knowledge] Resync started", {
        knowledgeId: id,
        newJobId: ingestionResponse.job_id,
        workflowId: ingestionResponse.workflow_id,
      })

      return NextResponse.json({
        data: {
          id: updatedKnowledge._id.toString(),
          sourceType: updatedKnowledge.sourceType,
          sourceUrl: updatedKnowledge.sourceUrl,
          sourceName: updatedKnowledge.sourceName,
          fileName: updatedKnowledge.fileName,
          status: "queued",
          jobId: updatedKnowledge.jobId,
          workflowId: updatedKnowledge.workflowId,
          name: updatedKnowledge.name,
          description: updatedKnowledge.description,
          startedAt: updatedKnowledge.startedAt?.toISOString(),
          completedAt: updatedKnowledge.completedAt?.toISOString(),
          createdAt: updatedKnowledge.createdAt.toISOString(),
          updatedAt: updatedKnowledge.updatedAt.toISOString(),
          syncHistory: serializeSyncHistory(updatedKnowledge.syncHistory),
        },
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("[Knowledge] Failed to start resync", {
        knowledgeId: id,
        sourceType: knowledge.sourceType,
        sourceUrl: knowledge.sourceUrl,
        error: errorMessage,
      })
      Sentry.captureException(error, {
        tags: {
          operation: "resync_knowledge",
          knowledgeId: id,
          sourceType: knowledge.sourceType,
        },
      })
      return NextResponse.json(
        { error: errorMessage || "Failed to start knowledge extraction" },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    console.error("Knowledge resync error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, {
      tags: {
        operation: "resync_knowledge",
        knowledgeId: id,
      },
    })
    return NextResponse.json(
      { error: errorMessage || "Failed to resync knowledge" },
      { status: 500 }
    )
  }
}

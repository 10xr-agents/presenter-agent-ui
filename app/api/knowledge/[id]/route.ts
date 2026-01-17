import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeSource, type KnowledgeStatus } from "@/lib/models/knowledge-source"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"
import { getWorkflowStatus } from "@/lib/knowledge-extraction/client"

/**
 * GET /api/knowledge/[id] - Get knowledge source details and workflow status
 */
export async function GET(
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

    // Use .lean() to get a plain JavaScript object
    let knowledge = await (KnowledgeSource as any).findById(id).lean()

    if (!knowledge) {
      return NextResponse.json({ error: "Knowledge source not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Fetch latest workflow status if job is active
    let workflowStatus: Awaited<ReturnType<typeof getWorkflowStatus>> | null = null
    if (knowledge.jobId && ["pending", "queued", "running"].includes(knowledge.status)) {
      try {
        console.log("[Knowledge] Fetching workflow status", {
          knowledgeId: id,
          jobId: knowledge.jobId,
          currentStatus: knowledge.status,
        })
        
        workflowStatus = await getWorkflowStatus(knowledge.jobId)
        
        console.log("[Knowledge] Workflow status retrieved", {
          knowledgeId: id,
          jobId: knowledge.jobId,
          workflowStatus: workflowStatus?.status,
          phase: workflowStatus?.phase,
          progress: workflowStatus?.progress,
        })
        
        // Update local status based on workflow status
        const statusMap: Record<string, KnowledgeStatus> = {
          "queued": "queued",
          "running": "running",
          "completed": "completed",
          "failed": "failed",
          "cancelled": "cancelled",
        }
        
        const mappedStatus = workflowStatus ? (statusMap[workflowStatus.status] || knowledge.status) : knowledge.status
        
        // Update status if it has changed
        if (mappedStatus !== knowledge.status && ["pending", "queued", "running", "completed", "failed", "cancelled"].includes(mappedStatus)) {
          // Fetch non-lean document for update
          const docToUpdate = await (KnowledgeSource as any).findById(id)
          if (docToUpdate) {
            if (mappedStatus === "running" && knowledge.status === "pending") {
              // Job started running
              docToUpdate.status = "running"
              await docToUpdate.save()
              knowledge.status = "running"
              
              // Update sync history
              const syncHistory = Array.isArray(docToUpdate.syncHistory) 
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
                      errorMessages: Array.isArray(s.errorMessages) ? s.errorMessages.map((e) => String(e)) : (Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : []), // Support both old 'errors' and new 'errorMessages' for backward compatibility
                      warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
                      pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
                      linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
                      errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
                    }
                  })
                : []
              
              const currentSyncIndex = syncHistory.findIndex(
                (sync: { jobId: string }) => sync.jobId === knowledge.jobId
              )
              
              if (currentSyncIndex >= 0) {
                syncHistory[currentSyncIndex] = {
                  ...syncHistory[currentSyncIndex],
                  status: "running",
                  phase: workflowStatus?.phase,
                  progress: workflowStatus?.progress,
                }
                docToUpdate.syncHistory = syncHistory
                await docToUpdate.save()
              }
              
              console.log("[Knowledge] Job started, updated status to running", {
                knowledgeId: id,
                jobId: knowledge.jobId,
              })
            } else if (mappedStatus === "completed" && knowledge.status !== "completed") {
              // Job completed
              docToUpdate.status = "completed"
              docToUpdate.completedAt = new Date()
              
              // Update sync history
              const syncHistory = Array.isArray(docToUpdate.syncHistory) 
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
                      errorMessages: Array.isArray(s.errorMessages) ? s.errorMessages.map((e) => String(e)) : (Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : []), // Support both old 'errors' and new 'errorMessages' for backward compatibility
                      warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
                      pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
                      linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
                      errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
                    }
                  })
                : []
              
              const currentSyncIndex = syncHistory.findIndex(
                (sync: { jobId: string }) => sync.jobId === knowledge.jobId
              )
              
              if (currentSyncIndex >= 0) {
                syncHistory[currentSyncIndex] = {
                  ...syncHistory[currentSyncIndex],
                  status: "completed",
                  completedAt: new Date(),
                  phase: workflowStatus?.phase,
                  progress: workflowStatus?.progress,
                }
              }
              
              docToUpdate.syncHistory = syncHistory
              await docToUpdate.save()
              knowledge.status = "completed"
              knowledge.completedAt = new Date()
              
              console.log("[Knowledge] Job completed", {
                knowledgeId: id,
                jobId: knowledge.jobId,
              })
            } else if (mappedStatus === "failed" && knowledge.status !== "failed") {
              // Job failed
              docToUpdate.status = "failed"
              
              // Update extraction errors
              if (workflowStatus && workflowStatus.errors.length > 0) {
                docToUpdate.extractionErrors = workflowStatus.errors.map((err) => ({
                  message: err,
                  phase: workflowStatus?.phase || undefined,
                  timestamp: new Date(),
                }))
              }
              
              // Update sync history
              const syncHistory = Array.isArray(docToUpdate.syncHistory) 
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
                      errorMessages: Array.isArray(s.errorMessages) ? s.errorMessages.map((e) => String(e)) : (Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : []), // Support both old 'errors' and new 'errorMessages' for backward compatibility
                      warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
                      pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
                      linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
                      errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
                    }
                  })
                : []
              
              const currentSyncIndex = syncHistory.findIndex(
                (sync: { jobId: string }) => sync.jobId === knowledge.jobId
              )
              
              if (currentSyncIndex >= 0) {
                syncHistory[currentSyncIndex] = {
                  ...syncHistory[currentSyncIndex],
                  status: "failed",
                  completedAt: new Date(),
                  errorMessages: workflowStatus?.errors || [], // Map from workflowStatus.errors to errorMessages
                  errorCount: workflowStatus?.errors.length || 0,
                }
              }
              
              docToUpdate.syncHistory = syncHistory
              await docToUpdate.save()
              knowledge.status = "failed"
              
              Sentry.captureMessage("Knowledge extraction workflow failed", {
                level: "warning",
                tags: {
                  operation: "workflow_failed",
                  knowledgeId: id,
                  jobId: knowledge.jobId,
                },
                extra: {
                  sourceType: knowledge.sourceType,
                  sourceUrl: knowledge.sourceUrl,
                  errors: workflowStatus?.errors || [],
                },
              })
            }
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorWithStatus = error as Error & { statusCode?: number; isNotFound?: boolean }
        const isJobNotFound = errorWithStatus.isNotFound || 
                              errorWithStatus.statusCode === 404 ||
                              errorMessage.toLowerCase().includes("not found")
        
        console.error("[Knowledge] Failed to fetch workflow status", {
          knowledgeId: id,
          jobId: knowledge.jobId,
          error: errorMessage,
          statusCode: errorWithStatus.statusCode,
          isJobNotFound,
        })
        
        // If job is not found (404), mark the sync as failed
        if (isJobNotFound) {
          console.warn("[Knowledge] Workflow not found, marking as failed", {
            knowledgeId: id,
            jobId: knowledge.jobId,
            currentStatus: knowledge.status,
          })
          
          // Update knowledge record to failed state
          const docToUpdate = await (KnowledgeSource as any).findById(id)
          if (docToUpdate) {
            docToUpdate.status = "failed"
            
            // Update sync history
            const syncHistory = Array.isArray(docToUpdate.syncHistory) 
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
            
            const currentSyncIndex = syncHistory.findIndex(
              (sync: { jobId: string }) => sync.jobId === knowledge.jobId
            )
            
            if (currentSyncIndex >= 0) {
              syncHistory[currentSyncIndex] = {
                ...syncHistory[currentSyncIndex],
                status: "failed",
                completedAt: new Date(),
                errors: [errorMessage],
                errorCount: (syncHistory[currentSyncIndex].errorCount || 0) + 1,
              }
            }
            
            docToUpdate.syncHistory = syncHistory
            await docToUpdate.save()
          }
          
          // Fetch fresh lean document
          knowledge = await (KnowledgeSource as any).findById(id).lean()
        }
      }
    }

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
          errors?: unknown
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

    return NextResponse.json({
      data: {
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
        maxPages: knowledge.options?.maxPages,
        maxDepth: knowledge.options?.maxDepth,
        strategy: knowledge.options?.strategy,
        includePaths: knowledge.options?.includePaths,
        excludePaths: knowledge.options?.excludePaths,
        pagesStored: knowledge.pagesStored,
        linksStored: knowledge.linksStored,
        screensExtracted: knowledge.screensExtracted,
        tasksExtracted: knowledge.tasksExtracted,
        startedAt: knowledge.startedAt?.toISOString(),
        completedAt: knowledge.completedAt?.toISOString(),
        createdAt: knowledge.createdAt.toISOString(),
        updatedAt: knowledge.updatedAt.toISOString(),
        syncHistory: serializeSyncHistory(knowledge.syncHistory),
        workflowStatus: workflowStatus ? {
          status: workflowStatus.status,
          phase: workflowStatus.phase || undefined,
          progress: workflowStatus.progress,
          errorMessages: workflowStatus.errors, // Map from workflowStatus.errors to errorMessages
          warnings: workflowStatus.warnings,
          checkpoints: workflowStatus.checkpoints,
        } : null,
      },
    })
  } catch (error: unknown) {
    console.error("Knowledge fetch error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, {
      tags: {
        operation: "get_knowledge",
        knowledgeId: id,
      },
    })
    return NextResponse.json(
      { error: errorMessage || "Failed to fetch knowledge" },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/knowledge/[id] - Update knowledge source configuration
 */
export async function PATCH(
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

    const body = (await req.json()) as {
      name?: string
      description?: string
      maxPages?: number
      maxDepth?: number
      strategy?: "BFS" | "DFS"
      includePaths?: string[]
      excludePaths?: string[]
    }

    const knowledge = await (KnowledgeSource as any).findById(id)

    if (!knowledge) {
      return NextResponse.json({ error: "Knowledge source not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Build update object
    const updateData: {
      name?: string
      description?: string
      "options.maxPages"?: number
      "options.maxDepth"?: number
      "options.strategy"?: "BFS" | "DFS"
      "options.includePaths"?: string[]
      "options.excludePaths"?: string[]
    } = {}

    if (body.name !== undefined) updateData.name = body.name || undefined
    if (body.description !== undefined) updateData.description = body.description || undefined
    if (body.maxPages !== undefined) updateData["options.maxPages"] = body.maxPages
    if (body.maxDepth !== undefined) updateData["options.maxDepth"] = body.maxDepth
    if (body.strategy !== undefined) updateData["options.strategy"] = body.strategy
    if (body.includePaths !== undefined) {
      updateData["options.includePaths"] = body.includePaths && body.includePaths.length > 0 ? body.includePaths : undefined
    }
    if (body.excludePaths !== undefined) {
      updateData["options.excludePaths"] = body.excludePaths && body.excludePaths.length > 0 ? body.excludePaths : undefined
    }

    await (KnowledgeSource as any).findByIdAndUpdate(id, updateData)

    // Fetch updated document
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
          errors?: unknown
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

    return NextResponse.json({
      data: {
        id: updatedKnowledge._id.toString(),
        sourceType: updatedKnowledge.sourceType,
        sourceUrl: updatedKnowledge.sourceUrl,
        sourceName: updatedKnowledge.sourceName,
        fileName: updatedKnowledge.fileName,
        status: updatedKnowledge.status,
        jobId: updatedKnowledge.jobId,
        workflowId: updatedKnowledge.workflowId,
        name: updatedKnowledge.name,
        description: updatedKnowledge.description,
        maxPages: updatedKnowledge.options?.maxPages,
        maxDepth: updatedKnowledge.options?.maxDepth,
        strategy: updatedKnowledge.options?.strategy,
        includePaths: updatedKnowledge.options?.includePaths,
        excludePaths: updatedKnowledge.options?.excludePaths,
        pagesStored: updatedKnowledge.pagesStored,
        linksStored: updatedKnowledge.linksStored,
        screensExtracted: updatedKnowledge.screensExtracted,
        tasksExtracted: updatedKnowledge.tasksExtracted,
        startedAt: updatedKnowledge.startedAt?.toISOString(),
        completedAt: updatedKnowledge.completedAt?.toISOString(),
        createdAt: updatedKnowledge.createdAt.toISOString(),
        updatedAt: updatedKnowledge.updatedAt.toISOString(),
        syncHistory: serializeSyncHistory(updatedKnowledge.syncHistory),
      },
    })
  } catch (error: unknown) {
    console.error("Knowledge update error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, {
      tags: {
        operation: "update_knowledge",
        knowledgeId: id,
      },
    })
    return NextResponse.json(
      { error: errorMessage || "Failed to update knowledge" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/knowledge/[id] - Delete knowledge source
 */
export async function DELETE(
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

    const knowledge = await (KnowledgeSource as any).findById(id).lean()

    if (!knowledge) {
      return NextResponse.json({ error: "Knowledge source not found" }, { status: 404 })
    }

    // Verify organization access
    if (knowledge.organizationId !== knowledgeOrgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Cancel the job if it's still running
    if (knowledge.jobId && ["pending", "queued", "running"].includes(knowledge.status)) {
      try {
        // Note: The new knowledge extraction API may not have a cancel endpoint yet
        // For now, we'll just delete the record
        console.log("[Knowledge] Deleting knowledge with active job", {
          knowledgeId: id,
          jobId: knowledge.jobId,
          status: knowledge.status,
        })
      } catch (error: unknown) {
        // Log but don't fail the delete operation
        console.error("[Knowledge] Failed to cancel job before delete", {
          knowledgeId: id,
          jobId: knowledge.jobId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await (KnowledgeSource as any).findByIdAndDelete(id)

    return NextResponse.json({ data: { id } })
  } catch (error: unknown) {
    console.error("Knowledge delete error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, {
      tags: {
        operation: "delete_knowledge",
        knowledgeId: id,
      },
    })
    return NextResponse.json(
      { error: errorMessage || "Failed to delete knowledge" },
      { status: 500 }
    )
  }
}

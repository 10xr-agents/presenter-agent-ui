import { ArrowLeft } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { KnowledgeDetail } from "@/components/knowledge/knowledge-detail"
import { Button } from "@/components/ui/button"
import { KnowledgeStatusBadge, type KnowledgeStatus } from "@/components/knowledge/knowledge-status-badge"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeSource } from "@/lib/models/knowledge-source"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  const { id } = await params

  // Get tenant state and organization ID
  const tenantState = await getTenantState(session.user.id)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }

  // In normal mode, use user ID; in organization mode, use organization ID
  const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  // Get organization name if in organization mode
  let organizationName: string | null = null
  if (tenantState === "organization" && organizationId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authApi = auth.api as any
      const orgResult = await authApi.getFullOrganization({
        headers: await headers(),
        query: {
          organizationId: organizationId,
        },
      })
      if (orgResult.data?.name) {
        organizationName = orgResult.data.name
      }
    } catch {
      // If we can't get organization name, continue without it
    }
  }

  try {
    await connectDB()

    // Use .lean() to get a plain JavaScript object instead of Mongoose document
    // This prevents circular reference issues during serialization
    const knowledge = await (KnowledgeSource as any).findById(id).lean()

    if (!knowledge) {
      notFound()
    }

    // Verify the knowledge belongs to the user's organization
    if (knowledge.organizationId !== knowledgeOrgId) {
      notFound()
    }

    // Properly serialize Mongoose document to plain object to avoid circular references
    // Convert dates to ISO strings and ensure all nested objects are plain
    // Remove _id fields from subdocuments as they contain buffers that can't be serialized
    const serializeSyncHistory = (syncHistory: unknown): Array<{
      jobId: string
      workflowId?: string
      status: KnowledgeStatus
      triggerType: "initial" | "resync"
      startedAt: string
      completedAt?: string
      phase?: string
      progress?: number
      errorMessages?: string[] // Renamed from 'errors' to avoid Mongoose reserved pathname
      errors?: string[] // Keep for backward compatibility during migration
      warnings?: string[]
      pagesProcessed?: number
      linksProcessed?: number
      errorCount?: number
    }> => {
      if (!Array.isArray(syncHistory)) return []
      const validStatuses = ["pending", "queued", "running", "completed", "failed", "cancelled"] as const
      const validTriggerTypes = ["initial", "resync"] as const
      return syncHistory.map((sync: unknown) => {
        const s = sync as {
          _id?: unknown // Mongoose subdocument _id that needs to be removed
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
        const status = String(s.status || "pending")
        const triggerType = String(s.triggerType || "initial")
        
        // Convert Date objects to ISO strings, handle various date formats
        let startedAtStr: string
        if (s.startedAt instanceof Date) {
          startedAtStr = s.startedAt.toISOString()
        } else if (s.startedAt) {
          // If it's already a string or other format, try to convert
          const date = new Date(s.startedAt as string | number)
          startedAtStr = isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
        } else {
          startedAtStr = new Date().toISOString()
        }
        
        let completedAtStr: string | undefined
        if (s.completedAt instanceof Date) {
          completedAtStr = s.completedAt.toISOString()
        } else if (s.completedAt) {
          const date = new Date(s.completedAt as string | number)
          completedAtStr = isNaN(date.getTime()) ? undefined : date.toISOString()
        }
        
        // Map old status values to new ones
        const mappedStatus = status === "exploring" ? "running" : status
        
        // Return plain object without _id field
        return {
          jobId: String(s.jobId || ""),
          workflowId: s.workflowId ? String(s.workflowId) : undefined,
          status: (validStatuses.includes(mappedStatus as typeof validStatuses[number]) 
            ? mappedStatus 
            : "pending") as "pending" | "queued" | "running" | "completed" | "failed" | "cancelled",
          triggerType: (validTriggerTypes.includes(triggerType as typeof validTriggerTypes[number])
            ? triggerType
            : "initial") as typeof validTriggerTypes[number],
          startedAt: startedAtStr,
          completedAt: completedAtStr,
          phase: s.phase ? String(s.phase) : undefined,
          progress: typeof s.progress === "number" ? s.progress : undefined,
          errorMessages: Array.isArray(s.errorMessages) ? s.errorMessages.map((e) => String(e)) : (Array.isArray(s.errors) ? s.errors.map((e) => String(e)) : []), // Support both old 'errors' and new 'errorMessages' for backward compatibility
          warnings: Array.isArray(s.warnings) ? s.warnings.map((w) => String(w)) : [],
          pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
          linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
          errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
        }
      })
    }

    // Map old status values to new ones for backward compatibility
    const mapStatus = (status: string): KnowledgeStatus => {
      const statusMap: Record<string, KnowledgeStatus> = {
        "pending": "pending",
        "exploring": "running",
        "queued": "queued",
        "running": "running",
        "completed": "completed",
        "failed": "failed",
        "cancelled": "cancelled",
      }
      return statusMap[status] || "pending"
    }

    const knowledgeData: {
      id: string
      sourceType: "documentation" | "website" | "video" | "file"
      sourceUrl?: string
      sourceName: string
      fileName?: string
      status: KnowledgeStatus
      jobId: string | null
      workflowId: string | null
      maxPages?: number
      maxDepth?: number
      strategy?: "BFS" | "DFS"
      includePaths?: string[]
      excludePaths?: string[]
      pagesStored?: number
      linksStored?: number
      screensExtracted?: number
      tasksExtracted?: number
      externalLinksDetected?: number
      extractionErrors?: Array<{ message: string; phase?: string; timestamp?: string }>
      name?: string
      description?: string
      tags?: string[]
      timesReferenced: number
      lastReferencedAt?: string
      startedAt?: string
      completedAt?: string
      syncHistory?: Array<{
        jobId: string
        workflowId?: string
        status: KnowledgeStatus
        triggerType: "initial" | "resync"
        startedAt: string
        completedAt?: string
        phase?: string
        progress?: number
        errorMessages?: string[] // Renamed from 'errors' to avoid Mongoose reserved pathname
      errors?: string[] // Keep for backward compatibility during migration
        warnings?: string[]
        pagesProcessed?: number
        linksProcessed?: number
        errorCount?: number
      }>
      createdAt: string
      updatedAt: string
    } = {
      id: knowledge._id.toString(),
      sourceType: String(knowledge.sourceType || "website") as "documentation" | "website" | "video" | "file",
      sourceUrl: knowledge.sourceUrl ? String(knowledge.sourceUrl) : undefined,
      sourceName: String(knowledge.sourceName || ""),
      fileName: knowledge.fileName ? String(knowledge.fileName) : undefined,
      status: mapStatus(String(knowledge.status || "pending")),
      jobId: knowledge.jobId ? String(knowledge.jobId) : null,
      workflowId: knowledge.workflowId ? String(knowledge.workflowId) : null,
      maxPages: knowledge.options?.maxPages ? Number(knowledge.options.maxPages) : undefined,
      maxDepth: knowledge.options?.maxDepth ? Number(knowledge.options.maxDepth) : undefined,
      strategy: knowledge.options?.strategy ? String(knowledge.options.strategy) as "BFS" | "DFS" : undefined,
      includePaths: Array.isArray(knowledge.options?.includePaths) ? knowledge.options.includePaths.map(String) : undefined,
      excludePaths: Array.isArray(knowledge.options?.excludePaths) ? knowledge.options.excludePaths.map(String) : undefined,
      pagesStored: typeof knowledge.pagesStored === "number" ? knowledge.pagesStored : undefined,
      linksStored: typeof knowledge.linksStored === "number" ? knowledge.linksStored : undefined,
      screensExtracted: typeof knowledge.screensExtracted === "number" ? knowledge.screensExtracted : undefined,
      tasksExtracted: typeof knowledge.tasksExtracted === "number" ? knowledge.tasksExtracted : undefined,
      name: knowledge.name ? String(knowledge.name) : undefined,
      description: knowledge.description ? String(knowledge.description) : undefined,
      tags: Array.isArray(knowledge.tags) ? knowledge.tags.map(String) : undefined,
      timesReferenced: typeof knowledge.timesReferenced === "number" ? knowledge.timesReferenced : 0,
      lastReferencedAt: knowledge.lastReferencedAt instanceof Date ? knowledge.lastReferencedAt.toISOString() : (knowledge.lastReferencedAt ? String(knowledge.lastReferencedAt) : undefined),
      startedAt: knowledge.startedAt instanceof Date ? knowledge.startedAt.toISOString() : (knowledge.startedAt ? String(knowledge.startedAt) : undefined),
      completedAt: knowledge.completedAt instanceof Date ? knowledge.completedAt.toISOString() : (knowledge.completedAt ? String(knowledge.completedAt) : undefined),
      syncHistory: serializeSyncHistory(knowledge.syncHistory),
      createdAt: knowledge.createdAt instanceof Date ? knowledge.createdAt.toISOString() : String(knowledge.createdAt || new Date()),
      updatedAt: knowledge.updatedAt instanceof Date ? knowledge.updatedAt.toISOString() : String(knowledge.updatedAt || new Date()),
    }

    return (
      <div className="space-y-0">
        {/* Header with Back Navigation */}
        <div className="border-b bg-background">
          <div className="space-y-4 py-6 px-6">
            {/* Back Navigation */}
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Link href="/knowledge">
                <ArrowLeft className="mr-1.5 h-3 w-3" />
                Knowledge
              </Link>
            </Button>

            {/* Primary Header - Name, Status, Source URL */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-semibold truncate">
                  {knowledgeData.name || knowledgeData.sourceName}
                </h1>
                <KnowledgeStatusBadge status={knowledgeData.status} />
              </div>
              {knowledgeData.description && (
                <p className="text-sm text-muted-foreground">
                  {knowledgeData.description}
                </p>
              )}
              {/* Source URL/File */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Source:</span>
                {knowledgeData.sourceUrl ? (
                  <a
                    href={knowledgeData.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:text-primary transition-colors truncate max-w-md"
                  >
                    {knowledgeData.sourceUrl}
                  </a>
                ) : (
                  <span className="font-medium truncate max-w-md">
                    {knowledgeData.fileName || knowledgeData.sourceName}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Tabs integrated within page frame */}
        <KnowledgeDetail 
          knowledge={knowledgeData} 
          organizationId={knowledgeOrgId}
        />
      </div>
    )
  } catch (error: unknown) {
    console.error("Knowledge fetch error:", error)
    notFound()
  }
}

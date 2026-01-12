import { ArrowLeft } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { KnowledgeDetail } from "@/components/knowledge/knowledge-detail"
import { Button } from "@/components/ui/button"
import { KnowledgeStatusBadge } from "@/components/knowledge/knowledge-status-badge"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { WebsiteKnowledge } from "@/lib/models/website-knowledge"
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
    const knowledge = await (WebsiteKnowledge as any).findById(id).lean()

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
    const serializeSyncHistory = (syncHistory: unknown) => {
      if (!Array.isArray(syncHistory)) return []
      const validStatuses = ["pending", "exploring", "completed", "failed", "cancelled"] as const
      const validTriggerTypes = ["initial", "resync"] as const
      return syncHistory.map((sync: unknown) => {
        const s = sync as {
          _id?: unknown // Mongoose subdocument _id that needs to be removed
          jobId?: unknown
          status?: unknown
          triggerType?: unknown
          startedAt?: unknown
          completedAt?: unknown
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
        
        // Return plain object without _id field
        return {
          jobId: String(s.jobId || ""),
          status: (validStatuses.includes(status as typeof validStatuses[number]) 
            ? status 
            : "pending") as typeof validStatuses[number],
          triggerType: (validTriggerTypes.includes(triggerType as typeof validTriggerTypes[number])
            ? triggerType
            : "initial") as typeof validTriggerTypes[number],
          startedAt: startedAtStr,
          completedAt: completedAtStr,
          pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
          linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
          errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
        }
      })
    }

    const serializeExplorationErrors = (errors: unknown) => {
      if (!Array.isArray(errors)) return []
      return errors.map((error: unknown) => {
        const e = error as {
          url?: unknown
          error?: unknown
          error_type?: unknown
          retry_count?: unknown
        }
        const errorType = e.error_type ? String(e.error_type) : undefined
        const validErrorTypes = ["network", "timeout", "http_4xx", "http_5xx", "parsing", "other"] as const
        return {
          url: String(e.url || ""),
          error: String(e.error || ""),
          error_type: errorType && validErrorTypes.includes(errorType as typeof validErrorTypes[number]) 
            ? (errorType as typeof validErrorTypes[number])
            : undefined,
          retry_count: typeof e.retry_count === "number" ? e.retry_count : undefined,
        }
      })
    }

    const knowledgeData = {
      id: knowledge._id.toString(),
      websiteUrl: String(knowledge.websiteUrl || ""),
      websiteDomain: String(knowledge.websiteDomain || ""),
      status: String(knowledge.status || "pending") as "pending" | "exploring" | "completed" | "failed" | "cancelled",
      explorationJobId: knowledge.explorationJobId ? String(knowledge.explorationJobId) : null,
      maxPages: typeof knowledge.maxPages === "number" ? knowledge.maxPages : undefined,
      maxDepth: typeof knowledge.maxDepth === "number" ? knowledge.maxDepth : undefined,
      strategy: knowledge.strategy ? String(knowledge.strategy) as "BFS" | "DFS" : undefined,
      includePaths: Array.isArray(knowledge.includePaths) ? knowledge.includePaths.map(String) : undefined,
      excludePaths: Array.isArray(knowledge.excludePaths) ? knowledge.excludePaths.map(String) : undefined,
      pagesStored: typeof knowledge.pagesStored === "number" ? knowledge.pagesStored : undefined,
      linksStored: typeof knowledge.linksStored === "number" ? knowledge.linksStored : undefined,
      externalLinksDetected: typeof knowledge.externalLinksDetected === "number" ? knowledge.externalLinksDetected : undefined,
      explorationErrors: serializeExplorationErrors(knowledge.explorationErrors),
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
      <div className="py-6">
        {/* Back Affordance */}
        <div className="mb-4">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-7 text-xs text-foreground opacity-85 hover:text-foreground hover:opacity-100"
          >
            <Link href="/knowledge">
              <ArrowLeft className="mr-1.5 h-3 w-3" />
              Knowledge
            </Link>
          </Button>
        </div>

        {/* Page Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold truncate">
                {knowledgeData.name || knowledgeData.websiteDomain}
              </h1>
              <KnowledgeStatusBadge status={knowledgeData.status} />
            </div>
            {knowledgeData.description && (
              <p className="mt-0.5 text-sm text-foreground">
                {knowledgeData.description}
              </p>
            )}
          </div>
        </div>

        {/* Main Content */}
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

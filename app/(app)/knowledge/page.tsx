import { Plus } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { KnowledgeListTable } from "@/components/knowledge/knowledge-list-table"
import { PageShell } from "@/components/shell/page-shell"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { KnowledgeSource } from "@/lib/models/knowledge-source"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Get tenant state and organization ID
  const tenantState = await getTenantOperatingMode(session.user.id)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }

  // In normal mode, use user ID; in organization mode, use organization ID
  const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  const params = await searchParams
  const page = parseInt(params.page || "1", 10)
  const limit = 25
  const status = params.status || "all"

  // Fetch initial data for server-side rendering
  let initialData: unknown[] = []
  let initialPagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  } | undefined

  try {
    await connectDB()

    const query: {
      organizationId: string
      status?: "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"
    } = {
      organizationId: knowledgeOrgId,
    }

    if (status !== "all") {
      // Map old status to new status
      const statusMap: Record<string, "pending" | "queued" | "running" | "completed" | "failed" | "cancelled"> = {
        "pending": "pending",
        "exploring": "running",
        "completed": "completed",
        "failed": "failed",
        "cancelled": "cancelled",
      }
      query.status = statusMap[status] || (status as "pending" | "queued" | "running" | "completed" | "failed" | "cancelled")
    }

    const totalCount = await (KnowledgeSource as any).countDocuments(query)
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
          status?: unknown
          triggerType?: unknown
          startedAt?: unknown
          completedAt?: unknown
          pagesProcessed?: unknown
          linksProcessed?: unknown
          errorCount?: unknown
        }
        return {
          jobId: String(s.jobId || ""),
          status: String(s.status || "pending"),
          triggerType: String(s.triggerType || "initial"),
          startedAt: s.startedAt instanceof Date ? s.startedAt.toISOString() : (s.startedAt ? String(s.startedAt) : new Date().toISOString()),
          completedAt: s.completedAt instanceof Date ? s.completedAt.toISOString() : (s.completedAt ? String(s.completedAt) : undefined),
          pagesProcessed: typeof s.pagesProcessed === "number" ? s.pagesProcessed : undefined,
          linksProcessed: typeof s.linksProcessed === "number" ? s.linksProcessed : undefined,
          errorCount: typeof s.errorCount === "number" ? s.errorCount : undefined,
        }
      })
    }

    initialData = knowledgeList.map((item: unknown) => {
      const knowledge = item as {
        _id: { toString: () => string }
        sourceType: string
        sourceUrl?: string
        sourceName: string
        fileName?: string
        status: string
        jobId: string | null
        workflowId: string | null
        pagesStored?: number
        linksStored?: number
        screensExtracted?: number
        tasksExtracted?: number
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
        pagesStored: knowledge.pagesStored,
        linksStored: knowledge.linksStored,
        screensExtracted: knowledge.screensExtracted,
        tasksExtracted: knowledge.tasksExtracted,
        name: knowledge.name,
        description: knowledge.description,
        startedAt: knowledge.startedAt?.toISOString(),
        completedAt: knowledge.completedAt?.toISOString(),
        createdAt: knowledge.createdAt.toISOString(),
        updatedAt: knowledge.updatedAt.toISOString(),
        syncHistory: serializeSyncHistory(knowledge.syncHistory),
      }
    })

    initialPagination = {
      page,
      limit,
      total: totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    }
  } catch (error: unknown) {
    console.error("Knowledge page error:", error)
    // Continue with empty data
  }

  return (
    <PageShell
      title="Knowledge"
      description="Manage knowledge extracted from websites, documentation, videos, and files"
      action={
        <Button asChild size="sm">
          <Link href="/knowledge/new">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Create Knowledge
          </Link>
        </Button>
      }
    >
      <KnowledgeListTable
        organizationId={knowledgeOrgId}
        initialData={initialData as never}
        initialPagination={initialPagination}
      />
    </PageShell>
  )
}

import { Plus } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { KnowledgeListTable } from "@/components/knowledge/knowledge-list-table"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { WebsiteKnowledge } from "@/lib/models/website-knowledge"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

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
  const tenantState = await getTenantState(session.user.id)
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
      status?: "pending" | "exploring" | "completed" | "failed" | "cancelled"
    } = {
      organizationId: knowledgeOrgId,
    }

    if (status !== "all") {
      query.status = status as "pending" | "exploring" | "completed" | "failed" | "cancelled"
    }

    const totalCount = await (WebsiteKnowledge as any).countDocuments(query)
    const skip = (page - 1) * limit
    const totalPages = Math.ceil(totalCount / limit)

    const knowledgeList = await (WebsiteKnowledge as any)
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    initialData = knowledgeList.map((item: unknown) => {
      const knowledge = item as {
        _id: { toString: () => string }
        websiteUrl: string
        websiteDomain: string
        status: string
        explorationJobId: string | null
        pagesStored?: number
        linksStored?: number
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
        websiteUrl: knowledge.websiteUrl,
        websiteDomain: knowledge.websiteDomain,
        status: knowledge.status,
        explorationJobId: knowledge.explorationJobId,
        pagesStored: knowledge.pagesStored,
        linksStored: knowledge.linksStored,
        name: knowledge.name,
        description: knowledge.description,
        startedAt: knowledge.startedAt?.toISOString(),
        completedAt: knowledge.completedAt?.toISOString(),
        createdAt: knowledge.createdAt.toISOString(),
        updatedAt: knowledge.updatedAt.toISOString(),
        syncHistory: knowledge.syncHistory,
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
    <div className="py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Knowledge</h1>
          <p className="mt-0.5 text-sm text-foreground">
            Manage website knowledge extracted from your target sites
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/knowledge/new">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Create Knowledge
          </Link>
        </Button>
      </div>
      <KnowledgeListTable
        organizationId={knowledgeOrgId}
        initialData={initialData as never}
        initialPagination={initialPagination}
      />
    </div>
  )
}

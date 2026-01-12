import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { KnowledgeDetail } from "@/components/knowledge/knowledge-detail"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import { WebsiteKnowledge } from "@/lib/models/website-knowledge"

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

  try {
    await connectDB()

    const knowledge = await (WebsiteKnowledge as any).findById(id)

    if (!knowledge) {
      notFound()
    }

    const knowledgeData = {
      id: knowledge._id.toString(),
      websiteUrl: knowledge.websiteUrl,
      websiteDomain: knowledge.websiteDomain,
      status: knowledge.status,
      explorationJobId: knowledge.explorationJobId,
      maxPages: knowledge.maxPages,
      maxDepth: knowledge.maxDepth,
      strategy: knowledge.strategy,
      pagesStored: knowledge.pagesStored,
      linksStored: knowledge.linksStored,
      externalLinksDetected: knowledge.externalLinksDetected,
      explorationErrors: knowledge.explorationErrors,
      name: knowledge.name,
      description: knowledge.description,
      tags: knowledge.tags,
      timesReferenced: knowledge.timesReferenced,
      lastReferencedAt: knowledge.lastReferencedAt,
      startedAt: knowledge.startedAt,
      completedAt: knowledge.completedAt,
      createdAt: knowledge.createdAt,
      updatedAt: knowledge.updatedAt,
    }

    return (
      <div className="space-y-6 py-6">
        <PageHeader
          title={knowledgeData.name || knowledgeData.websiteDomain}
          description={knowledgeData.description || knowledgeData.websiteUrl}
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Knowledge", href: "/knowledge" },
            { label: knowledgeData.name || "Details" },
          ]}
        />
        <KnowledgeDetail knowledge={knowledgeData} organizationId="default-org" />
      </div>
    )
  } catch (error: unknown) {
    console.error("Knowledge fetch error:", error)
    notFound()
  }
}

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { KnowledgeCreationForm } from "@/components/knowledge/knowledge-creation-form"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

export default async function NewKnowledgePage() {
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

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Create Knowledge</h1>
        <p className="mt-0.5 text-sm text-foreground">
          Extract and index knowledge from websites, documentation, videos, or files
        </p>
      </div>
      <KnowledgeCreationForm organizationId={knowledgeOrgId} />
    </div>
  )
}

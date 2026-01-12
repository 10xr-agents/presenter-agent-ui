import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { CreationWizard } from "@/components/screen-agents/creation-wizard"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantState } from "@/lib/utils/tenant-state"

export default async function NewScreenAgentPage() {
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
  const agentsOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  return (
    <div className="py-6">
      <CreationWizard organizationId={agentsOrgId} />
    </div>
  )
}

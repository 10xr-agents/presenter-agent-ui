import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { CreationWizard } from "@/components/screen-agents/creation-wizard"
import { auth } from "@/lib/auth"

export default async function NewScreenAgentPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Get organization ID from session or query parameter
  // In production, this would come from Better Auth active organization context
  // For now, we'll require it as a query parameter or use a default
  const organizationId = "default-org" // TODO: Get from Better Auth active organization

  return (
    <div className="container mx-auto py-8">
      <CreationWizard organizationId={organizationId} />
    </div>
  )
}

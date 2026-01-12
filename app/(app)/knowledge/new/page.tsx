import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { KnowledgeCreationForm } from "@/components/knowledge/knowledge-creation-form"
import { auth } from "@/lib/auth"

export default async function NewKnowledgePage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Get organization ID from Better Auth active organization context
  const organizationId = "default-org" // TODO: Get from Better Auth active organization

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="Create Knowledge"
        description="Extract and index knowledge from a website"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Knowledge", href: "/knowledge" },
          { label: "Create" },
        ]}
      />
      <KnowledgeCreationForm organizationId={organizationId} />
    </div>
  )
}

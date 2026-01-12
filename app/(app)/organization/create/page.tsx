import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { CreateOrgForm } from "@/components/organizations/create-org-form"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function CreateOrganizationPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // If user already has an organization, redirect to dashboard
  const tenantState = await getTenantState(session.user.id)
  if (tenantState === "organization") {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Organization"
        description="Set up your organization to enable team collaboration, billing, and advanced features"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Create Organization" },
        ]}
      />
      <CreateOrgForm />
    </div>
  )
}

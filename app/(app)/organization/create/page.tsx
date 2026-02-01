import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { CreateOrgForm } from "@/components/organizations/create-org-form"
import { auth } from "@/lib/auth"
import { getTenantOperatingMode } from "@/lib/utils/tenant-state"

export default async function CreateOrganizationPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // If user already has an organization, redirect to dashboard
  const tenantState = await getTenantOperatingMode(session.user.id)
  if (tenantState === "organization") {
    redirect("/dashboard")
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Create Organization</h1>
        <p className="mt-0.5 text-sm text-foreground">
          Set up your organization to enable team collaboration, billing, and advanced features
        </p>
      </div>
      <CreateOrgForm />
    </div>
  )
}

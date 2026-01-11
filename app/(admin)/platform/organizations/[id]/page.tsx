import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { OrganizationDetails } from "@/components/admin/organization-details"
import { auth } from "@/lib/auth"
import { hasPermission } from "@/lib/config/roles"

export default async function OrganizationDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  const userRole = "platform_admin" // TODO: Get from session or database
  const isAdmin = hasPermission(userRole, "admin", "view_analytics")
  if (!isAdmin) {
    redirect("/")
  }

  const { id } = await params

  return <OrganizationDetails organizationId={id} />
}

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PlatformAdminDashboard } from "@/components/admin/platform-dashboard"
import { auth } from "@/lib/auth"
import { hasPermission } from "@/lib/config/roles"

export default async function PlatformAdminPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  // Check admin permission
  const userRole = "platform_admin" // TODO: Get from session or database
  const isAdmin = hasPermission(userRole, "admin", "view_analytics")
  if (!isAdmin) {
    redirect("/")
  }

  return <PlatformAdminDashboard />
}

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { hasPermission } from "@/lib/config/roles"

// Force dynamic rendering - this layout uses headers() for session checking
export const dynamic = "force-dynamic"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  // Check admin permission
  // Note: In production, get user's role from database
  // For now, this is a placeholder - enhance based on your needs
  const userRole = "platform_admin" // Get from session metadata or database
  const isAdmin = hasPermission(userRole, "admin", "view_analytics")
  if (!isAdmin) {
    redirect("/")
  }

  return <>{children}</>
}


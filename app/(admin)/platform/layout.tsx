import { Building2, FileText, LayoutDashboard, Users } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { hasPermission } from "@/lib/config/roles"

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card">
        <div className="flex h-full flex-col">
          <div className="border-b p-4">
            <h2 className="text-lg font-semibold">Platform Admin</h2>
          </div>
          <nav className="flex-1 space-y-1 p-4">
            <Link
              href="/platform"
              className="flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Dashboard</span>
            </Link>
            <Link
              href="/platform/organizations"
              className="flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <Building2 className="h-4 w-4" />
              <span>Organizations</span>
            </Link>
            <Link
              href="/platform/contracts"
              className="flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <FileText className="h-4 w-4" />
              <span>Contracts</span>
            </Link>
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  )
}

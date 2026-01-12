"use client"

import {
  Activity,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Presentation,
  Settings,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { TenantState } from "@/lib/utils/tenant-state"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/utils"

const { useSession } = authClient

interface AppSidebarProps {
  tenantState?: TenantState
}

const baseNavigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Screen Agents",
    href: "/screen-agents",
    icon: Presentation,
  },
  {
    name: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
]

const organizationNavigation = [
  {
    name: "Billing",
    href: "/billing",
    icon: CreditCard,
  },
  {
    name: "Teams",
    href: "/teams",
    icon: Users,
  },
]

export function AppSidebar({ tenantState = "normal" }: AppSidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Combine navigation based on tenant state
  const navigation = [
    ...baseNavigation,
    ...(tenantState === "organization" ? organizationNavigation : []),
  ]

  const user = mounted && session?.user ? session.user : null
  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || "U"

  return (
    <aside className="hidden w-56 border-r bg-background lg:flex lg:flex-col">
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* User info at bottom - Resend style */}
      {mounted && user && (
        <div className="border-t p-3">
          <div className="flex items-center gap-2.5">
            <Avatar className="h-7 w-7">
              <AvatarImage src={user.image || undefined} alt={user.name || user.email || "User"} />
              <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{user.name || "User"}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

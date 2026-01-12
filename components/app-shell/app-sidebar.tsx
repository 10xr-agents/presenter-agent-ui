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
import type { TenantState } from "@/lib/utils/tenant-state"
import { cn } from "@/lib/utils"

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

  // Combine navigation based on tenant state
  const navigation = [
    ...baseNavigation,
    ...(tenantState === "organization" ? organizationNavigation : []),
  ]

  return (
    <aside className="hidden w-64 border-r bg-card lg:block">
      <nav className="flex flex-col gap-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

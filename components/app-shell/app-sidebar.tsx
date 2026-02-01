"use client"

import {
  BarChart3,
  BookOpen,
  CreditCard,
  Home,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { TenantOperatingMode } from "@/lib/utils/tenant-state"
import { NavUser } from "./nav-user"
import { TeamSwitcher } from "./team-switcher"

interface AppSidebarProps {
  tenantState?: TenantOperatingMode
}

const baseNavigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: Home,
  },
  {
    name: "Chats",
    href: "/chats",
    icon: MessageSquare,
  },
  {
    name: "Knowledge",
    href: "/knowledge",
    icon: BookOpen,
  },
  {
    name: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    name: "Billing",
    href: "/billing",
    icon: CreditCard,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
]

const organizationNavigation = [
  {
    name: "Teams",
    href: "/teams",
    icon: Users,
  },
]

export function AppSidebar({ tenantState = "normal" }: AppSidebarProps) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Combine navigation based on tenant state
  const navigation = [
    ...baseNavigation,
    ...(tenantState === "organization" ? organizationNavigation : []),
  ]

  return (
    <aside className="hidden w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 lg:flex lg:flex-col lg:h-screen">
      {/* SidebarHeader - Team Switcher */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 p-3">
        <TeamSwitcher />
      </div>

      {/* SidebarContent - Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const Icon = item.icon

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="leading-snug">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* SidebarFooter - User Profile with Theme Toggle (Fixed at bottom) */}
      {mounted && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
          <NavUser />
        </div>
      )}
    </aside>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { TenantOperatingMode } from "@/lib/utils/tenant-state"

interface SettingsLayoutProps {
  children: React.ReactNode
  tenantState?: TenantOperatingMode
}

// Tenant-Level Settings Tabs (Resend style: horizontal tabs)
const tenantSettingsTabs = [
  {
    href: "/settings",
    label: "Usage",
  },
  {
    href: "/settings/members",
    label: "Members",
  },
  {
    href: "/settings/general",
    label: "General",
  },
  {
    href: "/settings/billing",
    label: "Billing",
  },
]

// Organization-Only Settings Tabs
const organizationSettingsTabs = [
  {
    href: "/settings/teams",
    label: "Teams",
  },
  {
    href: "/settings/security",
    label: "Security",
  },
]

export function SettingsLayout({ children, tenantState = "normal" }: SettingsLayoutProps) {
  const pathname = usePathname()

  const allTabs = [
    ...tenantSettingsTabs,
    ...(tenantState === "organization" ? organizationSettingsTabs : []),
  ]

  return (
    <div className="space-y-6">
      {/* Horizontal Tabs - Enterprise-grade design */}
      <div className="border-b">
        <nav className="-mb-px flex space-x-6" aria-label="Settings">
          {allTabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Settings Content */}
      <div className="space-y-6">{children}</div>
    </div>
  )
}

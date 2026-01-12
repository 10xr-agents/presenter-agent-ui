"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { TenantState } from "@/lib/utils/tenant-state"

interface SettingsLayoutProps {
  children: React.ReactNode
  tenantState?: TenantState
}

// User-Level Settings (Always Visible)
const userSettingsTabs = [
  {
    href: "/settings",
    label: "Profile",
    description: "Manage your account information",
  },
  {
    href: "/settings/authentication",
    label: "Authentication",
    description: "Password and security settings",
  },
  {
    href: "/settings/preferences",
    label: "Preferences",
    description: "Theme, language, and notifications",
  },
]

// Tenant-Level Settings (Always Visible - Both Modes)
const tenantSettingsTabs = [
  {
    href: "/settings/tenant/members",
    label: "Members",
    description: "Manage tenant members and roles",
  },
  {
    href: "/settings/tenant/general",
    label: "General",
    description: "Tenant information and settings",
  },
  {
    href: "/settings/api-keys",
    label: "API Keys",
    description: "Manage tenant API keys",
  },
]

// Organization-Only Settings (Organization Mode Only)
const organizationSettingsTabs = [
  {
    href: "/settings/organization/teams",
    label: "Teams",
    description: "Team management and roles",
  },
  {
    href: "/settings/organization/billing",
    label: "Billing",
    description: "Payment methods and invoices",
  },
  {
    href: "/settings/organization/security",
    label: "Security",
    description: "Security and access settings",
  },
]

export function SettingsLayout({ children, tenantState = "normal" }: SettingsLayoutProps) {
  const pathname = usePathname()

  const userTabs = userSettingsTabs
  const tenantTabs = tenantSettingsTabs
  const orgTabs = tenantState === "organization" ? organizationSettingsTabs : []

  return (
    <div className="space-y-6">
      {/* User-Level Settings Tabs */}
      <div className="border-b">
        <nav className="-mb-px flex space-x-8" aria-label="Account Settings">
          {userTabs.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
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
      <div>{children}</div>

      {/* Tenant-Level Settings Section (Always Visible) */}
      {tenantTabs.length > 0 && (
        <div className="space-y-4 border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Tenant Settings</h2>
          <nav className="flex flex-col space-y-1" aria-label="Tenant Settings">
            {tenantTabs.map((tab) => {
              const isActive =
                pathname === tab.href || pathname.startsWith(`${tab.href}/`)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      {/* Organization-Only Settings Section (Organization Mode Only) */}
      {tenantState === "organization" && orgTabs.length > 0 && (
        <div className="space-y-4 border-t pt-6">
          <h2 className="text-lg font-semibold mb-4">Organization Features</h2>
          <nav className="flex flex-col space-y-1" aria-label="Organization Features">
            {orgTabs.map((tab) => {
              const isActive =
                pathname === tab.href || pathname.startsWith(`${tab.href}/`)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </div>
  )
}

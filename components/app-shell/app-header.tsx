"use client"

import Image from "next/image"
import Link from "next/link"
import type { TenantState } from "@/lib/utils/tenant-state"
import { MobileSidebar } from "./mobile-sidebar"
import { OrganizationSwitcher } from "./organization-switcher"
import { UserMenu } from "./user-menu"

interface AppHeaderProps {
  tenantState?: TenantState
}

export function AppHeader({ tenantState = "normal" }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left side - Mobile menu and Logo */}
        <div className="flex items-center gap-4">
          <MobileSidebar tenantState={tenantState} />
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/logos/logo_7.svg"
              alt="Screen Agent Platform"
              width={24}
              height={24}
              className="h-6 w-6"
            />
            <span className="hidden font-semibold sm:inline-block">Screen Agent</span>
          </Link>
        </div>

        {/* Right side - Organization Switcher and User Menu */}
        <div className="flex items-center gap-4">
          {/* Only show organization switcher in organization mode */}
          {tenantState === "organization" && (
            <div className="hidden md:block">
              <OrganizationSwitcher />
            </div>
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

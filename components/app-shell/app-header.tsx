"use client"

import { Chrome } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import type { TenantOperatingMode } from "@/lib/utils/tenant-state"
import { MobileSidebar } from "./mobile-sidebar"
import { OrganizationSwitcher } from "./organization-switcher"

interface AppHeaderProps {
  tenantState?: TenantOperatingMode
}

export function AppHeader({ tenantState = "normal" }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="flex h-12 items-center justify-between px-6">
        {/* Left side - Mobile menu and Logo */}
        <div className="flex items-center gap-3">
          <MobileSidebar tenantState={tenantState} />
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/logos/logo_7.svg"
              alt="Browser Copilot"
              width={20}
              height={20}
              className="h-5 w-5"
            />
            <span className="hidden text-sm font-medium sm:inline-block">Browser Copilot</span>
          </Link>
        </div>

        {/* Right side - Install Extension CTA and Organization Switcher */}
        <div className="flex items-center gap-2">
          {/* Install Extension CTA */}
          <Button
            asChild
            size="sm"
            variant="outline"
            className="hidden sm:flex"
          >
            <a
              href="https://chrome.google.com/webstore"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Chrome className="mr-2 h-3.5 w-3.5" />
              Install Extension
            </a>
          </Button>

          {/* Only show organization switcher in organization mode */}
          {tenantState === "organization" && (
            <div className="hidden md:block">
              <OrganizationSwitcher />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

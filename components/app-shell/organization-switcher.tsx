"use client"

import { Building2, ChevronsUpDown, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSession } from "@/lib/auth/client"

interface Organization {
  id: string
  name: string
  slug?: string
}

export function OrganizationSwitcher() {
  const router = useRouter()
  const { data: session, isPending } = useSession()

  // TODO: Use Better Auth's useListOrganizations and useActiveOrganization hooks
  // when they're available in the client
  // For now, this is a placeholder that shows the current organization name
  
  const currentOrgName = session?.user?.name 
    ? `${session.user.name}'s Organization` 
    : "My Organization"

  if (isPending) {
    return (
      <Button variant="outline" className="h-8 justify-start px-2.5 text-sm" disabled>
        <Building2 className="mr-2 h-3.5 w-3.5" />
        <span className="truncate">Loading...</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-8 justify-between px-2.5 text-sm">
          <div className="flex items-center">
            <Building2 className="mr-2 h-3.5 w-3.5" />
            <span className="truncate">{currentOrgName}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-medium">Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <span className="text-sm text-muted-foreground">Organization switching coming soon</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/organization/create" className="flex items-center">
            <Plus className="mr-2 h-4 w-4" />
            Create organization
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

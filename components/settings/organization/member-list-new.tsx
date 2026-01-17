"use client"

import { format } from "date-fns"
import { Mail, MoreVertical, Shield, Trash2, User, UserPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { AdvancedTable, type Column } from "@/components/ui/advanced-table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { authClient } from "@/lib/auth/client"
import { toast } from "@/lib/utils/toast"
import { InviteMemberDialog } from "./invite-member-dialog"

interface Member {
  id: string
  userId: string
  role: string
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    image?: string
  }
}

interface OrganizationMembersListProps {
  organizationId: string
  initialMembers: Member[]
}

export function OrganizationMembersList({
  organizationId,
  initialMembers,
}: OrganizationMembersListProps) {
  const [members, setMembers] = useState<Member[]>(initialMembers)
  const [isLoading, setIsLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null)
  const [roleChangeDialogOpen, setRoleChangeDialogOpen] = useState(false)
  const [memberToUpdate, setMemberToUpdate] = useState<{
    id: string
    name: string
    currentRole: string
    newRole: string
  } | null>(null)

  const loadMembers = async () => {
    setIsLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgResult = await (authClient as any).organization.getActive()
      if (!orgResult.data) {
        throw new Error("No active organization")
      }

      const fullOrgResult = await (authClient as any).organization.getFullOrganization({
        organizationId: orgResult.data.id,
      })

      if (fullOrgResult.data?.members) {
        setMembers(fullOrgResult.data.members)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load members"
      toast.error("Failed to load members", message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (initialMembers.length === 0) {
      loadMembers()
    }
  }, [organizationId])

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    setMemberToDelete({ id: memberId, name: memberName })
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!memberToDelete) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgResult = await (authClient as any).organization.getActive()
      if (!orgResult.data) {
        throw new Error("No active organization")
      }

      const response = await fetch(
        `/api/organization/${orgResult.data.id}/members/${memberToDelete.id}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || "Failed to remove member")
      }

      toast.success("Member removed successfully")
      loadMembers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to remove member"
      toast.error("Failed to remove member", message)
    } finally {
      setDeleteDialogOpen(false)
      setMemberToDelete(null)
    }
  }

  const handleChangeRole = async (memberId: string, memberName: string, newRole: "owner" | "admin" | "member") => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return

    if (member.role === newRole) return

    setMemberToUpdate({
      id: memberId,
      name: memberName,
      currentRole: member.role,
      newRole,
    })
    setRoleChangeDialogOpen(true)
  }

  const confirmRoleChange = async () => {
    if (!memberToUpdate) return

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgResult = await (authClient as any).organization.getActive()
      if (!orgResult.data) {
        throw new Error("No active organization")
      }

      const response = await fetch(
        `/api/organization/${orgResult.data.id}/members/${memberToUpdate.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: memberToUpdate.newRole }),
        }
      )

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || "Failed to update role")
      }

      toast.success("Role updated successfully")
      loadMembers()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update role"
      toast.error("Failed to update role", message)
    } finally {
      setRoleChangeDialogOpen(false)
      setMemberToUpdate(null)
    }
  }

  const columns: Column<Member>[] = [
    {
      id: "member",
      header: "Member",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={row.user.image || undefined} alt={row.user.name} />
            <AvatarFallback>{row.user.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="font-medium">{row.user.name}</span>
        </div>
      ),
    },
    {
      id: "email",
      header: "Email",
      accessorFn: (row) => row.user.email,
      sortable: true,
      filterable: true,
    },
    {
      id: "role",
      header: "Role",
      accessorKey: "role",
      sortable: true,
      cell: (row) => (
        <Badge variant="secondary" className="capitalize">
          {row.role}
        </Badge>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      accessorFn: (row) => format(new Date(row.createdAt), "PPP"),
      sortable: true,
    },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => {
        const currentUserRole = members.find((m) => m.userId === row.userId)?.role
        const canManage = currentUserRole === "owner" || currentUserRole === "admin"

        if (!canManage || row.role === "owner") {
          return null
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {row.role !== "admin" && (
                <DropdownMenuItem
                  onClick={() => handleChangeRole(row.id, row.user.name, "admin")}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Make Admin
                </DropdownMenuItem>
              )}
              {row.role !== "member" && (
                <DropdownMenuItem
                  onClick={() => handleChangeRole(row.id, row.user.name, "member")}
                >
                  <User className="mr-2 h-4 w-4" />
                  Make Member
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleRemoveMember(row.id, row.user.name)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove Member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Organization Members</CardTitle>
          <CardDescription>Manage your organization's team members and their roles.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Organization Members</CardTitle>
            <CardDescription>Manage your organization's team members and their roles.</CardDescription>
          </div>
          <InviteMemberDialog onInviteSuccess={loadMembers} />
        </CardHeader>
        <CardContent>
          <AdvancedTable
            data={members}
            columns={columns}
            searchable
            searchPlaceholder="Search members..."
            emptyMessage="No members yet. Invite your first team member to collaborate on Screen Agents."
          />
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Remove Member"
        description={`Are you sure you want to remove ${memberToDelete?.name} from the organization? This action cannot be undone.`}
        confirmText="Remove"
        variant="destructive"
        onConfirm={confirmDelete}
        icon={<Trash2 className="h-5 w-5" />}
      />

      <ConfirmationDialog
        open={roleChangeDialogOpen}
        onOpenChange={setRoleChangeDialogOpen}
        title="Change Member Role"
        description={`Change ${memberToUpdate?.name}'s role from ${memberToUpdate?.currentRole} to ${memberToUpdate?.newRole}?`}
        confirmText="Change Role"
        onConfirm={confirmRoleChange}
        icon={<Shield className="h-5 w-5" />}
      />
    </>
  )
}

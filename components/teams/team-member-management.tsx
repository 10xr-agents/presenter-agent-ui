"use client"

import { Loader2, Plus, Trash2, UserPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface TeamMember {
  userId: string
  teamRole: "team_admin" | "team_member"
  addedByUserId: string
  createdAt: string
}

interface TeamMemberManagementProps {
  teamId: string
}

export function TeamMemberManagement({ teamId }: TeamMemberManagementProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newMemberUserId, setNewMemberUserId] = useState("")
  const [newMemberRole, setNewMemberRole] = useState<"team_admin" | "team_member">("team_member")
  const [addingMember, setAddingMember] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  useEffect(() => {
    fetchMembers()
  }, [teamId])

  const fetchMembers = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/teams/${teamId}/members`)
      if (!response.ok) throw new Error("Failed to fetch members")

      const data = (await response.json()) as { members?: TeamMember[] }
      if (data.members) {
        setMembers(data.members)
      }
    } catch (error: unknown) {
      console.error("Fetch members error:", error)
      toast.error("Failed to load team members")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddMember = async () => {
    if (!newMemberUserId.trim()) {
      toast.error("User ID is required")
      return
    }

    setAddingMember(true)
    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: newMemberUserId.trim(),
          teamRole: newMemberRole,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to add member")
      }

      toast.success("Member added successfully")
      setAddModalOpen(false)
      setNewMemberUserId("")
      setNewMemberRole("team_member")
      fetchMembers()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(errorMessage)
    } finally {
      setAddingMember(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    setMemberToDelete(userId)
    setDeleteDialogOpen(true)
  }

  const confirmRemove = async () => {
    if (!memberToDelete) return

    setIsRemoving(true)
    try {
      const response = await fetch(
        `/api/teams/${teamId}/members?userId=${memberToDelete}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to remove member")
      }

      toast.success("Member removed successfully")
      fetchMembers()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(errorMessage)
    } finally {
      setIsRemoving(false)
      setDeleteDialogOpen(false)
      setMemberToDelete(null)
    }
  }

  const handleUpdateRole = async (
    userId: string,
    newRole: "team_admin" | "team_member"
  ) => {
    try {
      const response = await fetch(`/api/teams/${teamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          teamRole: newRole,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to update role")
      }

      toast.success("Role updated successfully")
      fetchMembers()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(errorMessage)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage members and their roles in this team
            </CardDescription>
          </div>
          <Button onClick={() => setAddModalOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {members.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No members yet. Add members to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell className="font-mono text-sm">
                    {member.userId}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.teamRole}
                      onValueChange={(value) =>
                        handleUpdateRole(member.userId, value as "team_admin" | "team_member")
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team_member">Member</SelectItem>
                        <SelectItem value="team_admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMember(member.userId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Add a user to this team by their user ID
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userId">User ID</Label>
              <Input
                id="userId"
                value={newMemberUserId}
                onChange={(e) => setNewMemberUserId(e.target.value)}
                placeholder="user_123..."
                required
                disabled={addingMember}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={newMemberRole}
                onValueChange={(value) =>
                  setNewMemberRole(value as "team_admin" | "team_member")
                }
                disabled={addingMember}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="team_member">Member</SelectItem>
                  <SelectItem value="team_admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddModalOpen(false)}
              disabled={addingMember}
            >
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={addingMember}>
              {addingMember ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Member
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Remove Team Member"
        description="Are you sure you want to remove this member from the team? This action cannot be undone."
        confirmText="Remove"
        variant="destructive"
        onConfirm={confirmRemove}
        loading={isRemoving}
        icon={<Trash2 className="h-5 w-5" />}
      />
    </Card>
  )
}

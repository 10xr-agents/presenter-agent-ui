"use client"

import { format } from "date-fns"
import { MoreVertical, Play, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AdvancedTable, type Column } from "@/components/ui/advanced-table"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import { toast } from "@/lib/utils/toast"

export interface ScreenAgent {
  _id: string
  name: string
  status: "active" | "inactive" | "draft" | "paused" | "archived"
  createdAt: string | Date
  updatedAt: string | Date
  organizationId?: string
}

interface ScreenAgentTableProps {
  agents: ScreenAgent[]
  onDelete?: (id: string) => Promise<void>
  onRefresh?: () => void
}

export function ScreenAgentTable({
  agents,
  onDelete,
  onRefresh,
}: ScreenAgentTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!agentToDelete || !onDelete) return

    setLoading(true)
    try {
      await onDelete(agentToDelete)
      toast.success("Screen agent deleted successfully")
      onRefresh?.()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete agent"
      toast.error("Failed to delete agent", message)
    } finally {
      setLoading(false)
      setDeleteDialogOpen(false)
      setAgentToDelete(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      active: "default",
      inactive: "secondary",
      draft: "outline",
    }

    return (
      <Badge variant={variants[status] || "secondary"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const columns: Column<ScreenAgent>[] = [
    {
      id: "name",
      header: "Name",
      accessorKey: "name",
      sortable: true,
      filterable: true,
      cell: (row) => (
        <Link
          href={`/screen-agents/${row._id}`}
          className="font-medium hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      sortable: true,
      filterable: true,
      cell: (row) => getStatusBadge(row.status),
    },
    {
      id: "createdAt",
      header: "Created",
      accessorKey: "createdAt",
      sortable: true,
      accessorFn: (row) => {
        const date = typeof row.createdAt === "string" ? new Date(row.createdAt) : row.createdAt
        return format(date, "MMM d, yyyy")
      },
    },
    {
      id: "updatedAt",
      header: "Updated",
      accessorKey: "updatedAt",
      sortable: true,
      accessorFn: (row) => {
        const date = typeof row.updatedAt === "string" ? new Date(row.updatedAt) : row.updatedAt
        return format(date, "MMM d, yyyy")
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/screen-agents/${row._id}`}>
                <Play className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {onDelete && (
              <DropdownMenuItem
                onClick={() => {
                  setAgentToDelete(row._id)
                  setDeleteDialogOpen(true)
                }}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <AdvancedTable
        data={agents}
        columns={columns}
        searchable
        searchPlaceholder="Search agents..."
        emptyMessage="No screen agents found. Create your first agent to get started."
      />

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Screen Agent"
        description="Are you sure you want to delete this screen agent? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={loading}
        icon={<Trash2 className="h-5 w-5" />}
      />
    </>
  )
}

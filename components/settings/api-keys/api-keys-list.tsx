"use client"

import { format } from "date-fns"
import { Key, Loader2, Plus , Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { AdvancedTable, type Column } from "@/components/ui/advanced-table"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/lib/utils/toast"

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  lastUsedAt?: string
  expiresAt?: string
  scopes?: string[]
  enabled: boolean
}

export function ApiKeysList() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    loadApiKeys()
  }, [])

  const loadApiKeys = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/api-keys")
      if (!response.ok) throw new Error("Failed to fetch API keys")

      const data = (await response.json()) as ApiKey[]
      if (Array.isArray(data)) {
        setApiKeys(data)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load API keys"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    setKeyToDelete({ id, name })
    setDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!keyToDelete) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/api-keys?id=${keyToDelete.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete API key")
      }

      toast.success("API key deleted successfully")
      loadApiKeys()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete API key"
      toast.error("Failed to delete API key", message)
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setKeyToDelete(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  const columns: Column<ApiKey>[] = [
    {
      id: "name",
      header: "Name",
      accessorKey: "name",
      sortable: true,
      filterable: true,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      id: "keyPrefix",
      header: "Key Prefix",
      accessorKey: "keyPrefix",
      cell: (row) => (
        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
          {row.keyPrefix}...
        </code>
      ),
    },
    {
      id: "createdAt",
      header: "Created",
      accessorFn: (row) => format(new Date(row.createdAt), "PPP"),
      sortable: true,
    },
    {
      id: "lastUsedAt",
      header: "Last Used",
      accessorFn: (row) =>
        row.lastUsedAt ? format(new Date(row.lastUsedAt), "PPP") : "Never",
      sortable: true,
    },
    {
      id: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(row.id, row.name)}
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">API Keys</h2>
            <p className="text-sm text-muted-foreground">
              Manage your API keys for programmatic access
            </p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create API Key
          </Button>
        </div>

        {apiKeys.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No API Keys</CardTitle>
              <CardDescription>
                Create an API key to access the Screen Agent Platform API programmatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={<Key className="h-5 w-5" />}
                title="No API Keys"
                description="Create an API key to access the Screen Agent Platform API programmatically."
                action={{
                  label: "Create Your First API Key",
                  onClick: () => {
                    // TODO: Open create API key dialog
                  },
                }}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Your API Keys</CardTitle>
              <CardDescription>
                Keep your API keys secure. They provide full access to your account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdvancedTable
                data={apiKeys}
                columns={columns}
                searchable
                searchPlaceholder="Search API keys..."
                emptyMessage="No API keys found"
              />
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete API Key"
        description={`Are you sure you want to delete the API key "${keyToDelete?.name}"? This action cannot be undone and any applications using this key will stop working.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
        loading={isDeleting}
        icon={<Trash2 className="h-5 w-5" />}
      />
    </>
  )
}

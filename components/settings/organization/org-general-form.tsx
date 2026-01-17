"use client"

import { Spinner } from "@/components/ui/spinner"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { authClient } from "@/lib/auth/client"
import { toast } from "@/lib/utils/toast"

export function OrgGeneralForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
  })

  useEffect(() => {
    // Load organization data
    const loadOrganization = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const orgResult = await (authClient as any).organization.getActive()
        if (orgResult.data) {
          setFormData({
            name: orgResult.data.name || "",
            slug: orgResult.data.slug || "",
            description: "", // TODO: Get from organization metadata
          })
        }
      } catch (err: unknown) {
        console.error("Error loading organization:", err)
      }
    }

    loadOrganization()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgResult = await (authClient as any).organization.getActive()
      if (!orgResult.data) {
        throw new Error("No active organization")
      }

      // TODO: Implement organization update API
      // For now, this is a placeholder
      const response = await fetch(`/api/organization/${orgResult.data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          metadata: JSON.stringify({ description: formData.description }),
        }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || "Failed to update organization")
      }

      toast.success("Organization updated successfully")
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update organization"
      setError(message)
      toast.error("Failed to update organization", message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs text-muted-foreground">
            Organization Name
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="My Organization"
            required
            disabled={loading}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug" className="text-xs text-muted-foreground">
            Organization Slug
          </Label>
          <Input
            id="slug"
            value={formData.slug}
            onChange={(e) =>
              setFormData({
                ...formData,
                slug: e.target.value.toLowerCase().replace(/\s+/g, "-"),
              })
            }
            placeholder="my-org"
            required
            disabled={loading}
            pattern="[a-z0-9-]+"
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            URL-friendly identifier (lowercase letters, numbers, and hyphens only)
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs text-muted-foreground">
            Description
          </Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="A brief description of your organization"
            rows={3}
            disabled={loading}
            className="text-sm"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={loading} size="sm">
          {loading ? (
            <>
              <Spinner className="mr-2 h-3.5 w-3.5" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </form>
  )
}

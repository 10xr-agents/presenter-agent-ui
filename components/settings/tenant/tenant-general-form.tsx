"use client"

import { Save } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { authClient } from "@/lib/auth/client"
import { toast } from "@/lib/utils/toast"

export function TenantGeneralForm() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")

  useEffect(() => {
    loadTenantInfo()
  }, [])

  const loadTenantInfo = async () => {
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgResult = await (authClient as any).organization.getActive()
      
      if (orgResult.data) {
        setName(orgResult.data.name || "")
        setSlug(orgResult.data.slug || "")
        // Description might be in metadata
        if (orgResult.data.metadata) {
          try {
            const metadata = JSON.parse(orgResult.data.metadata as string) as {
              description?: string
            }
            setDescription(metadata.description || "")
          } catch {
            // Metadata is not JSON, ignore
          }
        }
      } else {
        // In normal mode, use user's name as tenant name
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const session = await (authClient as any).getSession()
        if (session.data?.user) {
          setName(session.data.user.name || "")
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to load tenant information"
      toast.error("Failed to load settings", message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orgResult = await (authClient as any).organization.getActive()
      
      if (orgResult.data) {
        // Update organization
        const updateResult = await (authClient as any).organization.update({
          organizationId: orgResult.data.id,
          name,
          slug,
          metadata: JSON.stringify({ description }),
        })

        if (updateResult.error) {
          throw new Error(updateResult.error.message || "Failed to update tenant settings")
        }

        toast.success("Settings updated successfully")
      } else {
        // In normal mode, we can't update tenant settings yet
        // This would require creating an organization or storing tenant metadata separately
        toast.error("Organization features required", "Enable organization features to update tenant settings")
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update settings"
      toast.error("Failed to update settings", message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Manage tenant information and settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
            <div className="h-24 w-full animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-muted/30">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">General Settings</CardTitle>
        <CardDescription className="text-xs">
          Manage tenant information and settings
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-medium">Tenant Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter tenant name"
              required
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              The display name for your tenant
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug" className="text-xs font-medium">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="tenant-slug"
              pattern="[a-z0-9-]+"
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              A URL-friendly identifier for your tenant (optional)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-xs font-medium">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter tenant description"
              rows={4}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              A brief description of your tenant (optional)
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving} size="sm">
              {saving ? (
                <>
                  <Spinner className="mr-2 h-3.5 w-3.5" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-3.5 w-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

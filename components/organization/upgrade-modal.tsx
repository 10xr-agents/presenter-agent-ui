"use client"

import { Building2, CheckCircle2, Loader2, Users, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { authClient } from "@/lib/auth/client"

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  onUpgradeComplete?: () => void
}

interface UpgradeStatus {
  loading: boolean
  checking: boolean
  canUpgrade: boolean
  currentType: "basic" | "enterprise" | null
  error: string | null
}

export function UpgradeModal({
  open,
  onOpenChange,
  organizationId,
  onUpgradeComplete,
}: UpgradeModalProps) {
  const [status, setStatus] = useState<UpgradeStatus>({
    loading: false,
    checking: true,
    canUpgrade: false,
    currentType: null,
    error: null,
  })

  // Check organization type when modal opens
  useEffect(() => {
    if (open && organizationId) {
      checkOrganizationType()
    }
  }, [open, organizationId])

  const checkOrganizationType = async () => {
    setStatus((prev) => ({ ...prev, checking: true, error: null }))

    try {
      const response = await fetch(
        `/api/organization/upgrade?organizationId=${organizationId}`
      )

      if (!response.ok) {
        throw new Error("Failed to check organization type")
      }

      const data = (await response.json()) as {
        type: "basic" | "enterprise"
        canUpgrade: boolean
      }

      setStatus({
        loading: false,
        checking: false,
        canUpgrade: data.canUpgrade,
        currentType: data.type,
        error: null,
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setStatus({
        loading: false,
        checking: false,
        canUpgrade: false,
        currentType: null,
        error: errorMessage,
      })
    }
  }

  const handleUpgrade = async () => {
    setStatus((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch("/api/organization/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to upgrade organization")
      }

      const result = (await response.json()) as {
        success: boolean
        teamId?: string
        membersMigrated?: number
        agentsAssigned?: number
      }

      if (result.success) {
        onUpgradeComplete?.()
        onOpenChange(false)
        // Refresh the page to show updated organization state
        window.location.reload()
      } else {
        throw new Error("Upgrade failed")
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setStatus((prev) => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }))
    }
  }

  if (status.checking) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (status.currentType === "enterprise") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Already Enterprise</DialogTitle>
            <DialogDescription>
              Your organization is already on the Enterprise plan.
            </DialogDescription>
          </DialogHeader>
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              You have access to all Enterprise features including teams, advanced
              analytics, and priority support.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upgrade to Enterprise</DialogTitle>
          <DialogDescription>
            Upgrade your organization to unlock advanced features and team management.
          </DialogDescription>
        </DialogHeader>

        {status.error && (
          <Alert variant="destructive">
            <AlertDescription>{status.error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">What you'll get:</h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 rounded-lg border p-4">
                <Building2 className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-medium">Team Management</h4>
                  <p className="text-sm text-muted-foreground">
                    Create teams, assign members, and manage permissions at scale.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <Users className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-medium">Member Migration</h4>
                  <p className="text-sm text-muted-foreground">
                    All existing members will be automatically added to the default
                    "General" team.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <Zap className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-medium">Advanced Features</h4>
                  <p className="text-sm text-muted-foreground">
                    Access to API, advanced analytics, custom branding, and priority
                    support.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border p-4">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-medium">Agent Assignment</h4>
                  <p className="text-sm text-muted-foreground">
                    All existing Screen Agents will be assigned to the General team.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Alert>
            <AlertDescription>
              <strong>Note:</strong> This upgrade will create a default "General" team
              and migrate all members and Screen Agents to it. You can create additional
              teams and reorganize after the upgrade.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status.loading}>
            Cancel
          </Button>
          <Button onClick={handleUpgrade} disabled={status.loading || !status.canUpgrade}>
            {status.loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Upgrading...
              </>
            ) : (
              "Upgrade to Enterprise"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

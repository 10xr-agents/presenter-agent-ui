"use client"

import { ArrowRight, Building2, CheckCircle2 } from "lucide-react"
import { useState } from "react"
import { UpgradeModal } from "@/components/organization/upgrade-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface UpgradePageClientProps {
  organizationId: string
}

export function UpgradePageClient({ organizationId }: UpgradePageClientProps) {
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Upgrade to Enterprise</h1>
        <p className="text-muted-foreground">
          Unlock advanced features and team management capabilities for your organization.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Basic Plan</CardTitle>
              <Badge variant="secondary">Current</Badge>
            </div>
            <CardDescription>Simple organization management</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>Single-tier organization</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>Admin and member roles</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>Screen Agent management</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>Basic analytics</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Enterprise Plan</CardTitle>
              <Badge>Recommended</Badge>
            </div>
            <CardDescription>Advanced team management and features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Team hierarchy and management</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Advanced permissions and roles</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>API access</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Advanced analytics</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Custom branding</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Priority support</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>Custom usage limits</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What happens when you upgrade?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">Default Team Created</h4>
                <p className="text-sm text-muted-foreground">
                  A "General" team will be automatically created for your organization.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <ArrowRight className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">Members Migrated</h4>
                <p className="text-sm text-muted-foreground">
                  All existing organization members will be added to the General team with
                  appropriate roles.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h4 className="font-medium">Screen Agents Assigned</h4>
                <p className="text-sm text-muted-foreground">
                  All existing Screen Agents will be assigned to the General team. You can
                  reorganize them later.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button size="lg" onClick={() => setUpgradeModalOpen(true)}>
          Upgrade to Enterprise
        </Button>
      </div>

      <UpgradeModal
        open={upgradeModalOpen}
        onOpenChange={setUpgradeModalOpen}
        organizationId={organizationId}
        onUpgradeComplete={() => {
          // Page will reload after upgrade
        }}
      />
    </div>
  )
}

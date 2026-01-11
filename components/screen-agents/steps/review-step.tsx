"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface ReviewStepProps {
  data: WizardData
  organizationId: string
  onPrevious: () => void
  onSaveDraft: (organizationId: string) => Promise<void>
}

export function ReviewStep({
  data,
  organizationId,
  onPrevious,
  onSaveDraft,
}: ReviewStepProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [agentId, setAgentId] = useState<string | null>(null)

  const handleCreate = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Create agent via API
      if (!data.name || !data.targetWebsiteUrl || !data.voiceConfig) {
        throw new Error("Required fields are missing")
      }

      const agentData = {
        name: data.name,
        description: data.description,
        organizationId,
        visibility: data.visibility || "private",
        targetWebsiteUrl: data.targetWebsiteUrl,
        websiteCredentials: data.websiteCredentials,
        voiceConfig: data.voiceConfig,
        conversationConfig: data.conversationConfig,
        knowledgeDocumentIds: data.knowledgeDocumentIds || [],
        domainRestrictions: data.domainRestrictions,
        sessionTimeoutMinutes: data.sessionTimeoutMinutes || 60,
        maxSessionDurationMinutes: data.maxSessionDurationMinutes || 120,
      }

      const response = await fetch("/api/screen-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to create agent")
      }

      const result = (await response.json()) as { data?: { id?: string } }
      if (result.data?.id) {
        setAgentId(result.data.id)
        setSuccess(true)

        // Redirect to agent detail page after a short delay
        setTimeout(() => {
          router.push(`/screen-agents/${result.data?.id}`)
        }, 1500)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to create agent"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-6">
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            <strong>Screen Agent created successfully!</strong>
            <br />
            Redirecting to agent details...
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Review & Create</h3>
        <p className="text-sm text-muted-foreground">
          Review your configuration and create your Screen Agent
        </p>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <p className="font-medium">{data.name || "Not set"}</p>
            </div>
            {data.description && (
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="text-sm">{data.description}</p>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Target Website</Label>
              <p className="text-sm font-mono">{data.targetWebsiteUrl || "Not set"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Visibility</Label>
              <p className="text-sm capitalize">{data.visibility || "private"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voice Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Provider</Label>
              <p className="text-sm capitalize">{data.voiceConfig?.provider || "Not set"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Language</Label>
              <p className="text-sm">{data.voiceConfig?.language || "Not set"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Voice</Label>
              <p className="text-sm">{data.voiceConfig?.voiceId || "Not set"}</p>
            </div>
          </CardContent>
        </Card>

        {data.websiteCredentials && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Website Authentication</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Credentials configured</p>
            </CardContent>
          </Card>
        )}

        {(data.knowledgeDocumentIds?.length || 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Knowledge Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {data.knowledgeDocumentIds?.length || 0} file(s) uploaded
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious} disabled={isLoading}>
          Previous
        </Button>
        <Button onClick={handleCreate} disabled={isLoading || !data.name || !data.targetWebsiteUrl || !data.voiceConfig}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Screen Agent"
          )}
        </Button>
      </div>
    </div>
  )
}

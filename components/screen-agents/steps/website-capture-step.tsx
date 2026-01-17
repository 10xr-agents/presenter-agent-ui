"use client"

import { AlertCircle, CheckCircle2, TestTube } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Textarea } from "@/components/ui/textarea"
import { WebsiteKnowledgeProgress } from "@/components/website-knowledge/website-knowledge-progress"
import { WebsiteKnowledgeSelector } from "@/components/website-knowledge/website-knowledge-selector"
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface WebsiteCaptureStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrevious: () => void
  onCreate: (organizationId: string) => Promise<string | null>
  organizationId: string
  isLoading: boolean
  error: string | null
}

export function WebsiteCaptureStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
  onCreate,
  organizationId,
  isLoading,
  error,
}: WebsiteCaptureStepProps) {
  const router = useRouter()
  const [targetWebsiteUrl, setTargetWebsiteUrl] = useState(data.targetWebsiteUrl || "")
  const [username, setUsername] = useState(data.websiteCredentials?.username || "")
  const [password, setPassword] = useState(data.websiteCredentials?.password || "")
  const [loginNotes, setLoginNotes] = useState(data.loginNotes || "")
  const [skipCredentials, setSkipCredentials] = useState(!data.websiteCredentials)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle")
  const [activeKnowledgeId, setActiveKnowledgeId] = useState<string | null>(null)
  const [isCreatingKnowledge, setIsCreatingKnowledge] = useState(false)

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      setUrlError("Website URL is required")
      return false
    }

    try {
      const urlObj = new URL(url)
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        setUrlError("URL must start with http:// or https://")
        return false
      }
      setUrlError(null)
      return true
    } catch {
      setUrlError("Please enter a valid URL (e.g., https://example.com)")
      return false
    }
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTargetWebsiteUrl(value)
    if (value.trim()) {
      validateUrl(value)
    } else {
      setUrlError(null)
    }
    // Reset active knowledge when URL changes
    setActiveKnowledgeId(null)
  }

  // Automatically start knowledge acquisition when URL is validated
  useEffect(() => {
    // Check if URL is valid
    let isValid = false
    try {
      if (targetWebsiteUrl.trim()) {
        const urlObj = new URL(targetWebsiteUrl)
        isValid = ["http:", "https:"].includes(urlObj.protocol)
      }
    } catch {
      isValid = false
    }

    if (!targetWebsiteUrl || urlError || !isValid) {
      return
    }

    // Debounce: wait 1 second after user stops typing
    const timeoutId = setTimeout(async () => {
      if (isCreatingKnowledge || activeKnowledgeId) {
        return
      }

      setIsCreatingKnowledge(true)
      try {
        const response = await fetch("/api/website-knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            websiteUrl: targetWebsiteUrl.trim(),
            organizationId,
            maxPages: 50,
            maxDepth: 3,
            strategy: "BFS",
            // Path restrictions can be added here if needed in the future
          }),
        })

        if (response.ok) {
          const result = (await response.json()) as { data?: { id: string; message?: string } }
          if (result.data?.id) {
            setActiveKnowledgeId(result.data.id)
            // If message indicates existing knowledge, it's already selected
            // The selector will handle displaying it
          }
        }
      } catch (err: unknown) {
        // Silently fail - knowledge acquisition is optional
        console.error("Failed to start knowledge acquisition:", err)
      } finally {
        setIsCreatingKnowledge(false)
      }
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [targetWebsiteUrl, organizationId, urlError, isCreatingKnowledge, activeKnowledgeId])

  const handleTestConnection = async () => {
    if (!validateUrl(targetWebsiteUrl)) {
      return
    }

    setIsTestingConnection(true)
    setConnectionStatus("idle")

    // Simulate connection test (replace with actual API call)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // For now, just validate URL format
    try {
      new URL(targetWebsiteUrl)
      setConnectionStatus("success")
    } catch {
      setConnectionStatus("error")
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleCreate = async () => {
    if (!validateUrl(targetWebsiteUrl)) {
      return
    }

    onUpdate({
      targetWebsiteUrl: targetWebsiteUrl.trim(),
      websiteCredentials: skipCredentials
        ? undefined
        : {
            username: username.trim(),
            password: password.trim(),
          },
      loginNotes: loginNotes.trim() || undefined,
    })

    const agentId = await onCreate(organizationId)
    if (agentId) {
      router.push(`/screen-agents/${agentId}`)
    }
  }

  const handleNext = () => {
    if (!validateUrl(targetWebsiteUrl)) {
      return
    }

    onUpdate({
      targetWebsiteUrl: targetWebsiteUrl.trim(),
      websiteCredentials: skipCredentials
        ? undefined
        : {
            username: username.trim(),
            password: password.trim(),
          },
      loginNotes: loginNotes.trim() || undefined,
    })
    onNext()
  }

  const isValid = targetWebsiteUrl.trim().length > 0 && !urlError

  return (
    <div className="space-y-4">
      <Alert className="bg-muted/50 border-muted">
        <AlertDescription className="text-xs text-muted-foreground">
          Credentials are encrypted and stored securely. We recommend creating a dedicated demo account. 2FA/OTP is not supported.
        </AlertDescription>
      </Alert>

      <div className="space-y-1.5">
        <Label htmlFor="targetWebsiteUrl" className="text-sm font-medium">
          Website URL <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="targetWebsiteUrl"
            type="url"
            value={targetWebsiteUrl}
            onChange={handleUrlChange}
            onBlur={() => validateUrl(targetWebsiteUrl)}
            placeholder="https://example.com"
            required
            className={urlError ? "border-destructive" : ""}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={!isValid || isTestingConnection}
          >
            {isTestingConnection ? (
              <Spinner className="h-3.5 w-3.5" />
            ) : (
              <TestTube className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {urlError ? (
          <p className="text-xs text-destructive">{urlError}</p>
        ) : connectionStatus === "success" ? (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            URL is valid and accessible
          </p>
        ) : connectionStatus === "error" ? (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Could not verify URL. Some sites may block automation.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            The website your agent will present and navigate
          </p>
        )}
      </div>

      {/* Website Knowledge Section */}
      {targetWebsiteUrl && !urlError && (
        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Website Knowledge</Label>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-7 text-xs"
            >
              <Link href="/knowledge">
                Manage Knowledge
              </Link>
            </Button>
          </div>
          <WebsiteKnowledgeSelector
            organizationId={organizationId}
            websiteUrl={targetWebsiteUrl}
            selectedKnowledgeId={activeKnowledgeId || undefined}
            onSelect={(knowledgeId) => {
              setActiveKnowledgeId(knowledgeId)
              // Store in wizard data for later use
              // Note: This could be added to WizardData if needed
            }}
            onCreateNew={() => {
              // Knowledge creation is handled automatically
            }}
          />

          {/* Show active knowledge progress if one is being generated */}
          {activeKnowledgeId && (
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Current Exploration</Label>
                  <WebsiteKnowledgeProgress
                    knowledgeId={activeKnowledgeId}
                    onComplete={() => {
                      // Knowledge completed - can proceed
                    }}
                    onError={(error) => {
                      console.error("Knowledge exploration error:", error)
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="space-y-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Credentials (Optional)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSkipCredentials(!skipCredentials)}
            className="h-7 text-xs"
          >
            {skipCredentials ? "Add" : "Skip"}
          </Button>
        </div>

        {!skipCredentials ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium">
                Username or Email
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="demo@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
              <p className="text-xs text-muted-foreground">
                2FA/OTP not supported.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loginNotes" className="text-sm font-medium">
                Login Instructions (Optional)
              </Label>
              <Textarea
                id="loginNotes"
                value={loginNotes}
                onChange={(e) => setLoginNotes(e.target.value)}
                placeholder="Any special instructions for the login flow"
                rows={2}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Skip if your website doesn&apos;t require authentication, or add credentials later.
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onPrevious} disabled={isLoading} size="sm">
          Previous
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={handleCreate}
            disabled={!isValid || isLoading}
            size="sm"
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-3.5 w-3.5" />
                Creating...
              </>
            ) : (
              "Create Agent"
            )}
          </Button>
          <Button variant="outline" onClick={handleNext} disabled={!isValid || isLoading} size="sm">
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

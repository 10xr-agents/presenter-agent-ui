"use client"

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import {
  KnowledgeDescriptionField,
  KnowledgeNameField,
  KnowledgePathRestrictions,
  KnowledgeUrlField,
} from "@/components/knowledge/knowledge-form-fields"
import { WebsiteKnowledgeProgress } from "@/components/website-knowledge/website-knowledge-progress"

interface KnowledgeCreationFormProps {
  organizationId: string
}

export function KnowledgeCreationForm({ organizationId }: KnowledgeCreationFormProps) {
  const router = useRouter()
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [skipAuthentication, setSkipAuthentication] = useState(true)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [includePaths, setIncludePaths] = useState("")
  const [excludePaths, setExcludePaths] = useState("")
  const [maxPages, setMaxPages] = useState<number | "">(100)
  const [maxDepth, setMaxDepth] = useState<number | "">(10)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdKnowledgeId, setCreatedKnowledgeId] = useState<string | null>(null)

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


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateUrl(websiteUrl)) {
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Prepare request payload
      const payload = {
        websiteUrl: websiteUrl.trim(),
        organizationId,
        maxPages: typeof maxPages === "number" ? maxPages : 100,
        maxDepth: typeof maxDepth === "number" ? maxDepth : 10,
        strategy: "BFS" as const,
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        includePaths: includePaths
          ? includePaths.split(",").map((p) => p.trim()).filter(Boolean)
          : undefined,
        excludePaths: excludePaths
          ? excludePaths.split(",").map((p) => p.trim()).filter(Boolean)
          : undefined,
        websiteCredentials: !skipAuthentication && username.trim() && password.trim()
          ? {
              username: username.trim(),
              password: password.trim(),
            }
          : undefined,
      }

      const response = await fetch("/api/website-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to create knowledge")
      }

      const result = (await response.json()) as { data?: { id: string } }
      if (result.data?.id) {
        setCreatedKnowledgeId(result.data.id)
        // Redirect after a short delay to allow user to see success state
        setTimeout(() => {
          router.push(`/knowledge/${result.data?.id}`)
        }, 2000)
      } else {
        throw new Error("No knowledge ID returned from server")
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create knowledge"
      setError(errorMessage)
    } finally {
      setIsCreating(false)
    }
  }

  const isValid = websiteUrl.trim().length > 0 && !urlError

  if (createdKnowledgeId) {
    return (
      <div className="space-y-4 border rounded-lg p-6">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          Knowledge created successfully
        </div>
        <p className="text-xs text-foreground">
          Website exploration has started. The Browser Automation Service is now extracting knowledge from your website.
        </p>
        <WebsiteKnowledgeProgress
          knowledgeId={createdKnowledgeId}
          onComplete={() => {
            router.push(`/knowledge/${createdKnowledgeId}`)
          }}
        />
        <p className="text-xs text-foreground opacity-85">
          You'll be redirected to the knowledge detail page shortly to view progress and results.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-4">
        <KnowledgeUrlField
          value={websiteUrl}
          onChange={(value) => {
            setWebsiteUrl(value)
            if (value.trim()) {
              validateUrl(value)
            } else {
              setUrlError(null)
            }
          }}
          onBlur={() => validateUrl(websiteUrl)}
          error={urlError}
          required
        />

        <KnowledgeNameField value={name} onChange={setName} />

        <KnowledgeDescriptionField value={description} onChange={setDescription} />
      </div>

      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold">Authentication</h3>
            <p className="text-xs text-foreground">
              Optional. Most websites can be processed without credentials.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSkipAuthentication(!skipAuthentication)}
            className="shrink-0"
          >
            {skipAuthentication ? "Add Credentials" : "Skip"}
          </Button>
        </div>

        {!skipAuthentication && (
          <div className="space-y-3">
            <Alert className="bg-muted/50 border-muted py-2">
              <AlertDescription className="text-xs text-foreground">
                Credentials are encrypted and stored securely. 2FA/OTP is not supported.
              </AlertDescription>
            </Alert>

            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-xs text-muted-foreground">
                Username or Email
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="demo@example.com"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="h-9"
              />
              <p className="text-xs text-foreground opacity-85">
                2FA/OTP not supported.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="advanced" className="border-none">
            <AccordionTrigger>
              <div className="flex-1 text-left space-y-0.5">
                <div>Advanced Options</div>
                <div className="text-xs font-normal opacity-85">
                  Depth, page limits, and path restrictions
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-2 space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="maxPages" className="text-xs text-muted-foreground">
                      Max Pages
                    </Label>
                    <Input
                      id="maxPages"
                      type="number"
                      min="1"
                      max="1000"
                      value={maxPages}
                      onChange={(e) => {
                        const value = e.target.value
                        setMaxPages(value === "" ? "" : parseInt(value, 10))
                      }}
                      placeholder="100"
                      className="h-9"
                    />
                    <p className="text-xs text-foreground opacity-85">
                      Maximum number of pages to process (default: 100)
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="maxDepth" className="text-xs text-muted-foreground">
                      Max Depth
                    </Label>
                    <Input
                      id="maxDepth"
                      type="number"
                      min="1"
                      max="20"
                      value={maxDepth}
                      onChange={(e) => {
                        const value = e.target.value
                        setMaxDepth(value === "" ? "" : parseInt(value, 10))
                      }}
                      placeholder="10"
                      className="h-9"
                    />
                    <p className="text-xs text-foreground opacity-85">
                      Maximum crawl depth from start URL (default: 10)
                    </p>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <KnowledgePathRestrictions
                    includePaths={includePaths}
                    excludePaths={excludePaths}
                    onIncludePathsChange={setIncludePaths}
                    onExcludePathsChange={setExcludePaths}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <div className="space-y-1">
              <p className="font-medium">Failed to create knowledge</p>
              <p>{error}</p>
              <p className="opacity-85">
                Please check your website URL and try again. If the issue persists, verify the Browser Automation Service is running.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isCreating}
          size="sm"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || isCreating} size="sm">
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Knowledge"
          )}
        </Button>
      </div>
    </form>
  )
}

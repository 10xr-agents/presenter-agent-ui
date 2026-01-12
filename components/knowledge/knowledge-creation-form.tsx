"use client"

import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { WebsiteKnowledgeProgress } from "@/components/website-knowledge/website-knowledge-progress"

interface KnowledgeCreationFormProps {
  organizationId: string
}

export function KnowledgeCreationForm({ organizationId }: KnowledgeCreationFormProps) {
  const router = useRouter()
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [skipCredentials, setSkipCredentials] = useState(true)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [includePaths, setIncludePaths] = useState("")
  const [excludePaths, setExcludePaths] = useState("")
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

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setWebsiteUrl(value)
    if (value.trim()) {
      validateUrl(value)
    } else {
      setUrlError(null)
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
      const response = await fetch("/api/website-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl: websiteUrl.trim(),
          organizationId,
          maxPages: 50,
          maxDepth: 3,
          strategy: "BFS",
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          includePaths: includePaths
            ? includePaths.split(",").map((p) => p.trim()).filter(Boolean)
            : undefined,
          excludePaths: excludePaths
            ? excludePaths.split(",").map((p) => p.trim()).filter(Boolean)
            : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to create knowledge")
      }

      const result = (await response.json()) as { data?: { id: string } }
      if (result.data?.id) {
        setCreatedKnowledgeId(result.data.id)
        // Optionally redirect after a delay, or let user stay to see progress
        setTimeout(() => {
          router.push(`/knowledge/${result.data?.id}`)
        }, 2000)
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
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Knowledge created successfully
            </div>
            <p className="text-xs text-muted-foreground">
              Exploration has started. You'll be redirected to view progress.
            </p>
            <WebsiteKnowledgeProgress
              knowledgeId={createdKnowledgeId}
              onComplete={() => {
                router.push(`/knowledge/${createdKnowledgeId}`)
              }}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="bg-muted/30">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="websiteUrl" className="text-sm font-semibold">
              Website URL <span className="text-destructive">*</span>
            </Label>
            <Input
              id="websiteUrl"
              type="url"
              value={websiteUrl}
              onChange={handleUrlChange}
              onBlur={() => validateUrl(websiteUrl)}
              placeholder="https://example.com"
              required
              className={urlError ? "border-destructive" : ""}
            />
            {urlError ? (
              <p className="text-xs text-destructive">{urlError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The website to extract knowledge from
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-sm font-semibold">
              Name (Optional)
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Website Knowledge"
            />
            <p className="text-xs text-muted-foreground">
              A friendly name for this knowledge source
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-sm font-semibold">
              Description (Optional)
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this knowledge source"
              rows={2}
            />
          </div>

          <div className="space-y-3 border-t pt-3">
            <div className="space-y-1.5">
              <Label htmlFor="includePaths" className="text-sm font-semibold">
                Include Paths (Optional)
              </Label>
              <Input
                id="includePaths"
                value={includePaths}
                onChange={(e) => setIncludePaths(e.target.value)}
                placeholder="/docs/*, /help/*"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated path patterns to include. Use * for wildcards (e.g., /docs/*)
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="excludePaths" className="text-sm font-semibold">
                Exclude Paths (Optional)
              </Label>
              <Input
                id="excludePaths"
                value={excludePaths}
                onChange={(e) => setExcludePaths(e.target.value)}
                placeholder="/admin/*, /api/*"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated path patterns to exclude. Use * for wildcards (e.g., /admin/*)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Authentication (Optional)</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSkipCredentials(!skipCredentials)}
              className="h-7 text-xs"
            >
              {skipCredentials ? "Add Credentials" : "Skip"}
            </Button>
          </div>

          {!skipCredentials && (
            <div className="space-y-3 border-t pt-3">
              <Alert className="bg-muted/50 border-muted py-2">
                <AlertDescription className="text-xs text-muted-foreground">
                  Credentials are encrypted and stored securely. 2FA/OTP is not supported.
                </AlertDescription>
              </Alert>

              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-sm font-semibold">
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
                <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
                <p className="text-xs text-muted-foreground">
                  2FA/OTP not supported.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
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

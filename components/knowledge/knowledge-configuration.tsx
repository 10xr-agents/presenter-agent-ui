"use client"

import { Edit2, Globe, Lock, Settings } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

interface KnowledgeConfigurationProps {
  knowledge: {
    id: string
    sourceType: "documentation" | "website" | "video" | "file"
    sourceUrl?: string
    sourceName: string
    fileName?: string
    maxPages?: number
    maxDepth?: number
    strategy?: "BFS" | "DFS"
    includePaths?: string[]
    excludePaths?: string[]
    name?: string
    description?: string
    organizationId: string
  }
  onUpdate?: () => void
  className?: string
}

export function KnowledgeConfiguration({
  knowledge,
  onUpdate,
  className,
}: KnowledgeConfigurationProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: knowledge.name || "",
    description: knowledge.description || "",
    maxPages: knowledge.maxPages || 100,
    maxDepth: knowledge.maxDepth || 10,
    strategy: knowledge.strategy || "BFS",
    includePaths: knowledge.includePaths?.join("\n") || "",
    excludePaths: knowledge.excludePaths?.join("\n") || "",
  })

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/knowledge/${knowledge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name || undefined,
          description: formData.description || undefined,
          maxPages: formData.maxPages,
          maxDepth: formData.maxDepth,
          strategy: formData.strategy,
          includePaths: formData.includePaths
            ? formData.includePaths.split("\n").filter((p) => p.trim())
            : undefined,
          excludePaths: formData.excludePaths
            ? formData.excludePaths.split("\n").filter((p) => p.trim())
            : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to update configuration")
      }

      setIsEditing(false)
      // Show success feedback
      const successMessage = "Configuration updated successfully"
      // You could use a toast here, but for now we'll rely on the UI update
      if (onUpdate) {
        onUpdate()
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update configuration"
      setError(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      name: knowledge.name || "",
      description: knowledge.description || "",
      maxPages: knowledge.maxPages || 100,
      maxDepth: knowledge.maxDepth || 10,
      strategy: knowledge.strategy || "BFS",
      includePaths: knowledge.includePaths?.join("\n") || "",
      excludePaths: knowledge.excludePaths?.join("\n") || "",
    })
    setIsEditing(false)
    setError(null)
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-foreground opacity-60" />
          <h3 className="text-sm font-semibold">Configuration</h3>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="h-7 text-xs"
          >
            <Edit2 className="mr-1 h-3 w-3" />
            Edit
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {isEditing ? (
        <div className="space-y-4">
          {/* Basic Information */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs">
                Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={knowledge.name || knowledge.sourceName}
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-xs">
                Description
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={2}
                className="text-sm"
              />
            </div>
          </div>

          {/* Source Information (Read-only) */}
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs text-foreground opacity-85">Source</Label>
            <div className="flex items-center gap-2 text-xs text-foreground opacity-85">
              <Globe className="h-3.5 w-3.5" />
              <span className="font-medium">{knowledge.sourceUrl || knowledge.fileName || knowledge.sourceName}</span>
            </div>
            <p className="text-xs text-foreground opacity-60">
              Source URL cannot be changed. Create a new Knowledge entry for a different URL.
            </p>
          </div>

          {/* Crawl Configuration */}
          <div className="space-y-3 border-t pt-3">
            <Label className="text-xs font-semibold">Crawl Settings</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="strategy" className="text-xs">
                  Strategy
                </Label>
                <Select
                  value={formData.strategy}
                  onValueChange={(value: "BFS" | "DFS") =>
                    setFormData({ ...formData, strategy: value })
                  }
                >
                  <SelectTrigger id="strategy" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BFS">BFS (Breadth-First)</SelectItem>
                    <SelectItem value="DFS">DFS (Depth-First)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxPages" className="text-xs">
                  Max Pages
                </Label>
                <Input
                  id="maxPages"
                  type="number"
                  min={1}
                  max={1000}
                  value={formData.maxPages}
                  onChange={(e) =>
                    setFormData({ ...formData, maxPages: parseInt(e.target.value) || 100 })
                  }
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxDepth" className="text-xs">
                Max Depth
              </Label>
              <Input
                id="maxDepth"
                type="number"
                min={1}
                max={20}
                value={formData.maxDepth}
                onChange={(e) =>
                  setFormData({ ...formData, maxDepth: parseInt(e.target.value) || 10 })
                }
                className="h-9 text-sm"
              />
              <p className="text-xs text-foreground opacity-60">
                Maximum crawl depth from the starting URL (1-20)
              </p>
            </div>
          </div>

          {/* Advanced Options */}
          <Accordion type="single" collapsible className="border-t pt-3">
            <AccordionItem value="advanced" className="border-none">
              <AccordionTrigger className="text-xs py-2">
                Advanced Options
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="includePaths" className="text-xs">
                    Include Paths (one per line)
                  </Label>
                  <Textarea
                    id="includePaths"
                    value={formData.includePaths}
                    onChange={(e) => setFormData({ ...formData, includePaths: e.target.value })}
                    placeholder="/docs/*&#10;/api/v1/*"
                    rows={3}
                    className="text-sm font-mono"
                  />
                  <p className="text-xs text-foreground opacity-60">
                    Only crawl URLs matching these patterns. Use * for wildcards.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="excludePaths" className="text-xs">
                    Exclude Paths (one per line)
                  </Label>
                  <Textarea
                    id="excludePaths"
                    value={formData.excludePaths}
                    onChange={(e) => setFormData({ ...formData, excludePaths: e.target.value })}
                    placeholder="/admin/*&#10;/api/*"
                    rows={3}
                    className="text-sm font-mono"
                  />
                  <p className="text-xs text-foreground opacity-60">
                    Skip URLs matching these patterns. Use * for wildcards.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Authentication Status (Read-only) */}
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs text-foreground opacity-85">Authentication</Label>
            <div className="flex items-center gap-2 text-xs text-foreground opacity-85">
              <Lock className="h-3.5 w-3.5" />
              <span>Not configured</span>
            </div>
            <p className="text-xs text-foreground opacity-60">
              Authentication configuration is set during Knowledge creation and cannot be changed.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>

          <Alert className="py-2">
            <AlertDescription className="text-xs">
              <strong>Note:</strong> Configuration changes will apply to future syncs. To apply changes
              immediately, click "Re-sync" after saving.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          {/* Basic Information */}
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="mt-0.5 font-medium">{knowledge.name || knowledge.sourceName}</dd>
          </div>
          {knowledge.description && (
            <div className="col-span-2">
              <dt className="text-muted-foreground">Description</dt>
              <dd className="mt-0.5 text-foreground">{knowledge.description}</dd>
            </div>
          )}

          {/* Source */}
          <div className="col-span-2">
            <dt className="text-muted-foreground">Source</dt>
            <dd className="mt-0.5 flex items-center gap-2 font-medium">
              {knowledge.sourceType === "website" || knowledge.sourceType === "documentation" || knowledge.sourceType === "video" ? (
                <Globe className="h-3.5 w-3.5 text-foreground opacity-60" />
              ) : (
                <Settings className="h-3.5 w-3.5 text-foreground opacity-60" />
              )}
              <span>{knowledge.sourceUrl || knowledge.fileName || knowledge.sourceName}</span>
            </dd>
          </div>

          {/* Crawl Configuration */}
          <div>
            <dt className="text-muted-foreground">Strategy</dt>
            <dd className="mt-0.5 font-medium">{knowledge.strategy || "BFS"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Max Pages</dt>
            <dd className="mt-0.5 font-medium">{knowledge.maxPages || 100}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Max Depth</dt>
            <dd className="mt-0.5 font-medium">{knowledge.maxDepth || 10}</dd>
          </div>

          {/* Advanced Options */}
          {(knowledge.includePaths && knowledge.includePaths.length > 0) ||
          (knowledge.excludePaths && knowledge.excludePaths.length > 0) ? (
            <>
              {knowledge.includePaths && knowledge.includePaths.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Include Paths</dt>
                  <dd className="mt-0.5 font-medium font-mono text-xs">
                    {knowledge.includePaths.join(", ")}
                  </dd>
                </div>
              )}
              {knowledge.excludePaths && knowledge.excludePaths.length > 0 && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Exclude Paths</dt>
                  <dd className="mt-0.5 font-medium font-mono text-xs">
                    {knowledge.excludePaths.join(", ")}
                  </dd>
                </div>
              )}
            </>
          ) : null}

          {/* Authentication */}
          <div className="col-span-2">
            <dt className="text-muted-foreground">Authentication</dt>
            <dd className="mt-0.5 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-foreground opacity-60" />
              <span>Not configured</span>
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

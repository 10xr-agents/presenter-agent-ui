"use client"

import { CheckCircle2, Globe, Plus } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { WebsiteKnowledgeProgress } from "./website-knowledge-progress"

interface WebsiteKnowledge {
  id: string
  websiteUrl: string
  websiteDomain: string
  status: "pending" | "exploring" | "completed" | "failed" | "cancelled"
  explorationJobId?: string | null
  pagesStored?: number
  linksStored?: number
  name?: string
  description?: string
  createdAt: string
}

interface WebsiteKnowledgeSelectorProps {
  organizationId: string
  websiteUrl?: string
  selectedKnowledgeId?: string
  onSelect: (knowledgeId: string | null) => void
  onCreateNew?: () => void
  className?: string
}

export function WebsiteKnowledgeSelector({
  organizationId,
  websiteUrl,
  selectedKnowledgeId,
  onSelect,
  onCreateNew,
  className,
}: WebsiteKnowledgeSelectorProps) {
  const [knowledgeList, setKnowledgeList] = useState<WebsiteKnowledge[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creatingKnowledge, setCreatingKnowledge] = useState(false)

  const fetchKnowledge = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/website-knowledge?organizationId=${organizationId}`
      )
      if (!response.ok) {
        throw new Error("Failed to fetch website knowledge")
      }

      const result = (await response.json()) as { data?: WebsiteKnowledge[] }
      setKnowledgeList(result.data || [])
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load knowledge"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (organizationId) {
      fetchKnowledge()
      // Refresh periodically to catch new/updated knowledge
      const interval = setInterval(fetchKnowledge, 5000)
      return () => clearInterval(interval)
    }
  }, [organizationId])

  // Auto-select existing knowledge when websiteUrl matches
  useEffect(() => {
    if (!websiteUrl || !knowledgeList.length || selectedKnowledgeId) {
      return
    }

    try {
      const urlObj = new URL(websiteUrl)
      const domain = urlObj.hostname.replace(/^www\./, "")

      // Find matching knowledge by domain
      const matchingKnowledge = knowledgeList.find(
        (k) => k.websiteDomain === domain && ["exploring", "completed"].includes(k.status)
      )

      if (matchingKnowledge) {
        onSelect(matchingKnowledge.id)
      }
    } catch {
      // Invalid URL, skip auto-selection
    }
  }, [websiteUrl, knowledgeList, selectedKnowledgeId, onSelect])

  const handleCreateNew = async () => {
    if (!websiteUrl) {
      setError("Website URL is required to create knowledge")
      return
    }

    setCreatingKnowledge(true)
    setError(null)

    try {
      const response = await fetch("/api/website-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteUrl,
          organizationId,
          maxPages: 50,
          maxDepth: 3,
          strategy: "BFS",
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to create website knowledge")
      }

      const result = (await response.json()) as { data?: { id: string } }
      if (result.data?.id) {
        await fetchKnowledge()
        onSelect(result.data.id)
        onCreateNew?.()
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create knowledge"
      setError(errorMessage)
    } finally {
      setCreatingKnowledge(false)
    }
  }

  // Filter to show completed knowledge first, then in-progress
  const completedKnowledge = knowledgeList.filter((k) => k.status === "completed")
  const inProgressKnowledge = knowledgeList.filter((k) =>
    ["pending", "exploring"].includes(k.status)
  )
  const failedKnowledge = knowledgeList.filter((k) => k.status === "failed")

  const displayKnowledge = [
    ...completedKnowledge,
    ...inProgressKnowledge,
    ...failedKnowledge,
  ]

  return (
    <div className={className}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Website Knowledge</Label>
          {websiteUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateNew}
              disabled={creatingKnowledge}
              className="h-7 text-xs"
            >
              {creatingKnowledge ? (
                <>
                  <Spinner className="mr-1 h-3 w-3" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-3 w-3" />
                  Generate New
                </>
              )}
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : displayKnowledge.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="pt-6">
              <div className="text-center py-4">
                <Globe className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No website knowledge available
                </p>
                {websiteUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateNew}
                    disabled={creatingKnowledge}
                    className="mt-3"
                  >
                    {creatingKnowledge ? (
                      <>
                        <Spinner className="mr-2 h-3.5 w-3.5" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Generate Knowledge
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <RadioGroup
            value={selectedKnowledgeId || "none"}
            onValueChange={(value) => onSelect(value === "none" ? null : value)}
          >
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="none" id="none" />
                <Label htmlFor="none" className="text-xs font-normal cursor-pointer">
                  No website knowledge
                </Label>
              </div>

              {displayKnowledge.map((knowledge) => (
                <Card
                  key={knowledge.id}
                  className={cn(
                    "bg-muted/30 transition-colors",
                    selectedKnowledgeId === knowledge.id && "ring-2 ring-primary"
                  )}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <RadioGroupItem
                        value={knowledge.id}
                        id={knowledge.id}
                        className="mt-0.5"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <Label
                              htmlFor={knowledge.id}
                              className="text-sm font-semibold cursor-pointer block truncate"
                            >
                              {knowledge.name || knowledge.websiteDomain}
                            </Label>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {knowledge.websiteUrl}
                            </p>
                          </div>
                          {knowledge.status === "completed" && (
                            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          )}
                        </div>

                        {knowledge.status === "completed" && knowledge.pagesStored && (
                          <p className="text-xs text-muted-foreground">
                            {knowledge.pagesStored} pages explored
                          </p>
                        )}

                        {["pending", "exploring"].includes(knowledge.status) && (
                          <WebsiteKnowledgeProgress
                            knowledgeId={knowledge.id}
                            onComplete={() => fetchKnowledge()}
                          />
                        )}

                        {knowledge.status === "failed" && (
                          <p className="text-xs text-destructive">
                            Exploration failed
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </RadioGroup>
        )}
      </div>
    </div>
  )
}

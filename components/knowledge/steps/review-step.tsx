"use client"

import { AlertCircle, CheckCircle2, Edit2, FileText, Globe, Save , X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { KnowledgeVisualization } from "@/components/knowledge/knowledge-visualization"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

interface ReviewStepProps {
  name: string
  description: string
  sourceName: string
  websiteUrl: string
  assetsCount: number
  knowledgeId: string | null
  onView: () => void
}

interface KnowledgeEntity {
  screens?: Array<{
    screen_id?: string
    name?: string
    [key: string]: unknown
  }>
  tasks?: Array<{
    task_id?: string
    name?: string
    description?: string
    [key: string]: unknown
  }>
  actions?: Array<{
    action_id?: string
    name?: string
    type?: string
    [key: string]: unknown
  }>
  transitions?: Array<{
    transition_id?: string
    source_screen_id?: string
    target_screen_id?: string
    trigger_action_id?: string
    [key: string]: unknown
  }>
  business_functions?: Array<{
    business_function_id?: string
    name?: string
    description?: string
    [key: string]: unknown
  }>
  workflows?: Array<{
    workflow_id?: string
    name?: string
    description?: string
    [key: string]: unknown
  }>
  statistics?: {
    screens_count?: number
    tasks_count?: number
    actions_count?: number
    transitions_count?: number
    business_functions_count?: number
    workflows_count?: number
    total_entities?: number
  }
}

export function ReviewStep({
  name,
  description,
  sourceName,
  websiteUrl,
  assetsCount,
  knowledgeId,
  onView,
}: ReviewStepProps) {
  const router = useRouter()
  const [knowledgeData, setKnowledgeData] = useState<KnowledgeEntity | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Record<string, unknown>>({})

  // Fetch knowledge data when component mounts
  useEffect(() => {
    const fetchKnowledge = async () => {
      if (!knowledgeId) return

      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/knowledge/query/${knowledgeId}`)
        
        if (!response.ok) {
          if (response.status === 404) {
            // Knowledge not found yet - might still be processing
            setError("Knowledge data not yet available. Please wait for extraction to complete.")
            return
          }
          throw new Error("Failed to fetch knowledge data")
        }

        const result = (await response.json()) as {
          data?: {
            screens?: unknown[]
            tasks?: unknown[]
            actions?: unknown[]
            transitions?: unknown[]
            business_functions?: unknown[]
            workflows?: unknown[]
            statistics?: {
              screens_count?: number
              tasks_count?: number
              actions_count?: number
              transitions_count?: number
              business_functions_count?: number
              workflows_count?: number
              total_entities?: number
            }
          }
        }

        if (result.data) {
          setKnowledgeData({
            screens: result.data.screens as KnowledgeEntity["screens"],
            tasks: result.data.tasks as KnowledgeEntity["tasks"],
            actions: result.data.actions as KnowledgeEntity["actions"],
            transitions: result.data.transitions as KnowledgeEntity["transitions"],
            business_functions: result.data.business_functions as KnowledgeEntity["business_functions"],
            workflows: result.data.workflows as KnowledgeEntity["workflows"],
            statistics: result.data.statistics,
          })

        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch knowledge data"
        setError(errorMessage)
        console.error("[ReviewStep] Failed to fetch knowledge:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchKnowledge()
  }, [knowledgeId])

  const handleEdit = (type: string, id: string, data: Record<string, unknown>) => {
    setEditingId(id)
    setEditData(data)
  }

  const handleSave = async (type: string, id: string) => {
    // TODO: Implement API call to save edited knowledge
    console.log("Saving", type, id, editData)
    setEditingId(null)
    setEditData({})
    // Refresh knowledge data after save
    // await fetchKnowledge()
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditData({})
  }

  const handleViewKnowledge = () => {
    if (knowledgeId) {
      router.push(`/knowledge/${knowledgeId}`)
    } else {
      onView()
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">Review Knowledge</h3>
        <p className="mt-0.5 text-xs text-foreground">
          Review and modify the extracted knowledge before finalizing
        </p>
      </div>

      {/* Basic Information Summary */}
      <Card className="bg-muted/30 mb-6">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span>Basic Information</span>
            </div>
            <div className="space-y-1.5 pl-1">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium text-foreground">{name || "Untitled"}</span>
              </div>
              {description && (
                <div className="text-xs text-foreground">{description}</div>
              )}
              {sourceName && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Source Name:</span>
                  <span className="text-foreground">{sourceName}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Globe className="h-3.5 w-3.5" />
              <span>Website Source</span>
            </div>
            <div className="pl-1">
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                {websiteUrl}
              </a>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <FileText className="h-3.5 w-3.5" />
              <span>Additional Assets</span>
            </div>
            <div className="pl-1">
              <Badge variant={assetsCount > 0 ? "default" : "secondary"} className="text-xs">
                {assetsCount} {assetsCount === 1 ? "asset" : "assets"} added
              </Badge>
            </div>
          </div>

          {knowledgeId && (
            <>
              <Separator />
              <div className="flex items-center gap-2 text-xs font-semibold text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Knowledge Created Successfully</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Knowledge Visualization */}
      {isLoading && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
              <div className="h-32 w-full bg-muted animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {!isLoading && !error && knowledgeData && (
        <KnowledgeVisualization
          knowledgeData={knowledgeData}
          isLoading={isLoading}
          onEdit={handleEdit}
          editingId={editingId}
          editData={editData}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}

      {knowledgeId && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleViewKnowledge}>
            View Knowledge Details
          </Button>
        </div>
      )}
    </div>
  )
}
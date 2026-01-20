"use client"

import { useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ArrowRight,
  Globe,
  MousePointerClick,
  List,
  Map as MapIcon,
  Workflow,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

interface KnowledgeVisualizationProps {
  knowledgeData: {
    screens?: Array<{
      screen_id?: string
      name?: string
      url?: string
      description?: string
      [key: string]: unknown
    }>
    tasks?: Array<{
      task_id?: string
      name?: string
      description?: string
      steps?: Array<{ action_id?: string; screen_id?: string; [key: string]: unknown }>
      [key: string]: unknown
    }>
    actions?: Array<{
      action_id?: string
      name?: string
      type?: string
      target_screen_id?: string
      [key: string]: unknown
    }>
    transitions?: Array<{
      transition_id?: string
      source_screen_id?: string
      target_screen_id?: string
      trigger_action_id?: string
      conditions?: string[]
      [key: string]: unknown
    }>
    business_functions?: Array<{
      business_function_id?: string
      name?: string
      description?: string
      related_screens?: string[]
      [key: string]: unknown
    }>
    workflows?: Array<{
      workflow_id?: string
      name?: string
      description?: string
      steps?: Array<{ screen_id?: string; task_id?: string; [key: string]: unknown }>
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
  isLoading?: boolean
  onEdit?: (type: string, id: string, data: Record<string, unknown>) => void
  editingId?: string | null
  editData?: Record<string, unknown>
  onSave?: (type: string, id: string) => void
  onCancel?: () => void
}

export function KnowledgeVisualization({
  knowledgeData,
  isLoading,
  onEdit,
  editingId,
  editData,
  onSave,
  onCancel,
}: KnowledgeVisualizationProps) {
  const [expandedWorkflows, setExpandedWorkflows] = useState<Set<string>>(new Set())
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set())
  const [selectedScreen, setSelectedScreen] = useState<string | null>(null)
  
  // Use local state if not provided as props
  const [localEditingId, setLocalEditingId] = useState<string | null>(null)
  const [localEditData, setLocalEditData] = useState<Record<string, unknown>>({})
  
  const currentEditingId = editingId !== undefined ? editingId : localEditingId
  const currentEditData = editData !== undefined ? editData : localEditData
  
  const handleEdit = (id: string, currentData: Record<string, unknown>) => {
    if (onEdit) {
      onEdit("entity", id, currentData)
    } else {
      setLocalEditingId(id)
      setLocalEditData(currentData)
    }
  }
  
  const handleSave = (type: string, id: string) => {
    if (onSave) {
      onSave(type, id)
    } else {
      console.log("Save", type, id, currentEditData)
      setLocalEditingId(null)
      setLocalEditData({})
    }
  }
  
  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      setLocalEditingId(null)
      setLocalEditData({})
    }
  }

  // Build screen map for quick lookup
  const screenMap = useMemo(() => {
    const map = new Map<string, (typeof knowledgeData.screens)[0]>()
    knowledgeData.screens?.forEach((screen) => {
      if (screen.screen_id) {
        map.set(screen.screen_id, screen)
      }
    })
    return map
  }, [knowledgeData.screens])

  // Build action map
  const actionMap = useMemo(() => {
    const map = new Map<string, (typeof knowledgeData.actions)[0]>()
    knowledgeData.actions?.forEach((action) => {
      if (action.action_id) {
        map.set(action.action_id, action)
      }
    })
    return map
  }, [knowledgeData.actions])

  // Build navigation graph: screen -> actions -> target screens
  const navigationGraph = useMemo(() => {
    const graph = new Map<
      string,
      Array<{ action: typeof knowledgeData.actions[0]; targetScreen: typeof knowledgeData.screens[0] }>
    >()

    knowledgeData.transitions?.forEach((transition) => {
      const sourceId = transition.source_screen_id
      const targetId = transition.target_screen_id
      const actionId = transition.trigger_action_id

      if (!sourceId || !targetId) return

      const sourceScreen = screenMap.get(sourceId)
      const targetScreen = screenMap.get(targetId)
      const action = actionId ? actionMap.get(actionId) : undefined

      if (sourceScreen && targetScreen) {
        if (!graph.has(sourceId)) {
          graph.set(sourceId, [])
        }
        graph.get(sourceId)?.push({
          action:
            action ||
            ({
              action_id: actionId,
              name: "Unknown Action",
              type: "click",
            } as typeof knowledgeData.actions[0]),
          targetScreen,
        })
      }
    })

    return graph
  }, [knowledgeData.transitions, screenMap, actionMap])

  // Group workflows by flow structure
  const workflowFlows = useMemo(() => {
    if (!knowledgeData.workflows) return []

    return knowledgeData.workflows.map((workflow) => {
      const steps: Array<{
        screen?: (typeof knowledgeData.screens)[0]
        task?: (typeof knowledgeData.tasks)[0]
        type: "screen" | "task"
      }> = []

      // Extract steps from workflow
      workflow.steps?.forEach((step: { screen_id?: string; task_id?: string; [key: string]: unknown }) => {
        if (step.screen_id) {
          const screen = screenMap.get(step.screen_id)
          if (screen) {
            steps.push({ screen, type: "screen" })
          }
        } else if (step.task_id) {
          const task = knowledgeData.tasks?.find((t) => t.task_id === step.task_id)
          if (task) {
            steps.push({ task, type: "task" })
          }
        }
      })

      return { workflow, steps }
    })
  }, [knowledgeData.workflows, knowledgeData.tasks, screenMap])

  const getScreenNavigations = (screenId: string): Array<{
    action: (typeof knowledgeData.actions)[0]
    targetScreen: (typeof knowledgeData.screens)[0]
  }> => {
    return navigationGraph.get(screenId) || []
  }

  const toggleWorkflow = (workflowId: string) => {
    setExpandedWorkflows((prev) => {
      const next = new Set(prev)
      if (next.has(workflowId)) {
        next.delete(workflowId)
      } else {
        next.add(workflowId)
      }
      return next
    })
  }

  const toggleFeature = (featureId: string) => {
    setExpandedFeatures((prev) => {
      const next = new Set(prev)
      if (next.has(featureId)) {
        next.delete(featureId)
      } else {
        next.add(featureId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
            <div className="h-32 w-full bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!knowledgeData.statistics || knowledgeData.statistics.total_entities === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="pt-6">
          <Empty className="border-0 p-0">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold">No knowledge extracted</EmptyTitle>
              <EmptyDescription className="text-xs">
                No knowledge entities have been extracted yet. Please wait for the extraction to complete.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="user-flows" className="space-y-4">
        <TabsList className="h-9">
          {knowledgeData.statistics.workflows_count && knowledgeData.statistics.workflows_count > 0 && (
            <TabsTrigger value="user-flows" className="text-xs">
              <Workflow className="mr-1.5 h-3.5 w-3.5" />
              User Flows ({knowledgeData.statistics.workflows_count})
            </TabsTrigger>
          )}
          {knowledgeData.statistics.business_functions_count && knowledgeData.statistics.business_functions_count > 0 && (
            <TabsTrigger value="features" className="text-xs">
              <List className="mr-1.5 h-3.5 w-3.5" />
              Business Features ({knowledgeData.statistics.business_functions_count})
            </TabsTrigger>
          )}
          {knowledgeData.statistics.screens_count && knowledgeData.statistics.screens_count > 0 && (
            <TabsTrigger value="site-map" className="text-xs">
              <MapIcon className="mr-1.5 h-3.5 w-3.5" />
              Site Map ({knowledgeData.statistics.screens_count})
            </TabsTrigger>
          )}
        </TabsList>

        {/* User Flows Tab */}
        {knowledgeData.statistics.workflows_count && knowledgeData.statistics.workflows_count > 0 && (
          <TabsContent value="user-flows" className="space-y-4">
            <div className="text-xs text-muted-foreground">
              User flows show step-by-step navigation paths through your application
            </div>

            <div className="space-y-3">
              {workflowFlows.map((flow) => {
                const workflowId = flow.workflow.workflow_id || String(Math.random())
                const isExpanded = expandedWorkflows.has(workflowId)

                return (
                  <Card key={workflowId} className="bg-background">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleWorkflow(workflowId)}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="flex-1">
                            <div className="text-sm font-semibold">
                              {currentEditingId === workflowId ? (
                                <Input
                                  value={(currentEditData.name as string) || flow.workflow.name || ""}
                                  onChange={(e) => {
                                    const newData = { ...currentEditData, name: e.target.value }
                                    if (editData === undefined) {
                                      setLocalEditData(newData)
                                    }
                                  }}
                                  className="text-xs h-7"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                flow.workflow.name || "Unnamed User Flow"
                              )}
                            </div>
                            {flow.workflow.description && !currentEditingId && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {flow.workflow.description}
                              </div>
                            )}
                            {currentEditingId === workflowId && (
                              <div className="mt-2">
                                <Textarea
                                  value={(currentEditData.description as string) || flow.workflow.description || ""}
                                  onChange={(e) => {
                                    const newData = { ...currentEditData, description: e.target.value }
                                    if (editData === undefined) {
                                      setLocalEditData(newData)
                                    }
                                  }}
                                  className="text-xs min-h-[60px]"
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Description"
                                />
                              </div>
                            )}
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          {!currentEditingId && (
                            <Badge variant="outline" className="text-xs">
                              {flow.steps.length} step{flow.steps.length !== 1 ? "s" : ""}
                            </Badge>
                          )}
                          {currentEditingId === workflowId ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSave("workflow", workflowId)
                                }}
                                className="h-7 w-7 p-0"
                              >
                                <Save className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCancel()
                                }}
                                className="h-7 w-7 p-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(workflowId, flow.workflow)
                              }}
                              className="h-7 w-7 p-0"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {isExpanded && !currentEditingId && (
                        <div className="mt-4 space-y-3 pt-3 border-t">
                          {flow.steps.length > 0 ? (
                            <div className="space-y-2 pl-6">
                              {flow.steps.map((step, index) => (
                                <div key={index} className="flex items-start gap-3">
                                  <div className="flex flex-col items-center">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                      {index + 1}
                                    </div>
                                    {index < flow.steps.length - 1 && (
                                      <div className="h-8 w-px bg-border" />
                                    )}
                                  </div>
                                  <div className="flex-1 pb-2">
                                    {step.type === "screen" && step.screen && (
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="text-sm font-medium">
                                            {step.screen.name || "Unnamed Screen"}
                                          </span>
                                        </div>
                                        {step.screen.url && (
                                          <div className="text-xs text-muted-foreground pl-5 font-mono truncate max-w-md">
                                            {step.screen.url}
                                          </div>
                                        )}
                                        {step.screen.description && (
                                          <div 
                                            className="text-xs text-muted-foreground pl-5 line-clamp-2"
                                            dangerouslySetInnerHTML={{ 
                                              __html: String(step.screen.description)
                                                .replace(/<br\s*\/?>/gi, '\n')
                                                .replace(/\n{3,}/g, '\n\n')
                                            }}
                                          />
                                        )}
                                      </div>
                                    )}
                                    {step.type === "task" && step.task && (
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <List className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="text-sm font-medium">
                                            {step.task.name || "Unnamed Task"}
                                          </span>
                                        </div>
                                        {step.task.description && (
                                          <div className="text-xs text-muted-foreground pl-5">
                                            {step.task.description}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground pl-6">
                              No steps defined for this workflow
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        )}

        {/* Business Features Tab */}
        {knowledgeData.statistics.business_functions_count && knowledgeData.statistics.business_functions_count > 0 && (
          <TabsContent value="features" className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Business features and their associated screens and capabilities
            </div>

            <div className="space-y-3">
              {knowledgeData.business_functions?.map((feature) => {
                const featureId = feature.business_function_id || String(Math.random())
                const isExpanded = expandedFeatures.has(featureId)
                const relatedScreens = feature.related_screens
                  ?.map((screenId) => screenMap.get(screenId))
                  .filter((screen): screen is typeof knowledgeData.screens[0] => !!screen) || []

                return (
                  <Card key={featureId} className="bg-background">
                    <CardContent className="pt-4">
                      <button
                        type="button"
                        onClick={() => toggleFeature(featureId)}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="text-sm font-semibold">
                              {feature.name || "Unnamed Feature"}
                            </div>
                            {feature.description && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {feature.description}
                              </div>
                            )}
                          </div>
                        </div>
                        {relatedScreens.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {relatedScreens.length} screen{relatedScreens.length !== 1 ? "s" : ""}
                          </Badge>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-4 space-y-3 pt-3 border-t">
                          {relatedScreens.length > 0 ? (
                            <div className="space-y-2 pl-6">
                              <div className="text-xs font-semibold text-muted-foreground mb-2">
                                Related Screens:
                              </div>
                              {relatedScreens.map((screen) => {
                                const navigations = getScreenNavigations(screen.screen_id || "")
                                return (
                                  <div
                                    key={screen.screen_id}
                                    className={cn(
                                      "rounded-md border p-3 space-y-2",
                                      selectedScreen === screen.screen_id
                                        ? "border-primary bg-primary/5"
                                        : "border-border bg-background"
                                    )}
                                  >
                                    <div
                                      className="flex items-center justify-between cursor-pointer"
                                      onClick={() =>
                                        setSelectedScreen(
                                          selectedScreen === screen.screen_id ? null : screen.screen_id || null
                                        )
                                      }
                                    >
                                      <div className="flex items-center gap-2">
                                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-sm font-medium">
                                          {screen.name || "Unnamed Screen"}
                                        </span>
                                      </div>
                                      {navigations.length > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                          {navigations.length} navigation{navigations.length !== 1 ? "s" : ""}
                                        </Badge>
                                      )}
                                    </div>
                                    {screen.url && (
                                      <div className="text-xs text-muted-foreground pl-5 font-mono truncate">
                                        {screen.url}
                                      </div>
                                    )}
                                    {screen.description && (
                                      <div 
                                        className="text-xs text-muted-foreground pl-5 line-clamp-2"
                                        dangerouslySetInnerHTML={{ 
                                          __html: String(screen.description)
                                            .replace(/<br\s*\/?>/gi, '\n')
                                            .replace(/\n{3,}/g, '\n\n')
                                        }}
                                      />
                                    )}
                                    {selectedScreen === screen.screen_id && navigations.length > 0 && (
                                      <div className="pl-5 pt-2 space-y-2 border-t mt-2">
                                        <div className="text-xs font-semibold text-muted-foreground">
                                          Navigation Options:
                                        </div>
                                        {navigations.map((nav, idx) => (
                                          <div
                                            key={idx}
                                            className="flex items-center gap-2 text-xs bg-muted/30 rounded p-2"
                                          >
                                            <MousePointerClick className="h-3 w-3 text-muted-foreground" />
                                            <span className="font-medium">{nav.action.name || "Unknown Action"}</span>
                                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-muted-foreground">
                                              {nav.targetScreen.name || "Next Screen"}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground pl-6">
                              No related screens found
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        )}

        {/* Site Map Tab */}
        {knowledgeData.statistics.screens_count && knowledgeData.statistics.screens_count > 0 && (
          <TabsContent value="site-map" className="space-y-4">
            <div className="space-y-1">
              <div className="text-xs text-foreground font-semibold">Interactive Site Map</div>
              <div className="text-xs text-muted-foreground">
                Click on any screen to see navigation paths. Shows how users move between screens and what actions trigger transitions.
              </div>
            </div>

            <div className="space-y-4">
              {knowledgeData.screens?.map((screen) => {
                const screenId = screen.screen_id || String(Math.random())
                const navigations = getScreenNavigations(screenId)
                const isSelected = selectedScreen === screenId

                // Get incoming navigations (screens that lead to this one)
                const incomingNavigations: Array<{
                  sourceScreen: (typeof knowledgeData.screens)[0]
                  action: (typeof knowledgeData.actions)[0]
                }> = []
                knowledgeData.transitions?.forEach((transition) => {
                  if (transition.target_screen_id === screenId && transition.source_screen_id) {
                    const sourceScreen = screenMap.get(transition.source_screen_id)
                    const action = transition.trigger_action_id ? actionMap.get(transition.trigger_action_id) : undefined
                    if (sourceScreen) {
                      incomingNavigations.push({
                        sourceScreen,
                        action:
                          action ||
                          ({
                            action_id: transition.trigger_action_id,
                            name: "Unknown Action",
                            type: "click",
                          } as (typeof knowledgeData.actions)[0]),
                      })
                    }
                  }
                })

                return (
                  <Card
                    key={screenId}
                    className={cn("bg-background transition-colors", isSelected && "border-primary")}
                  >
                    <CardContent className="pt-4">
                      <div className="cursor-pointer" onClick={() => setSelectedScreen(isSelected ? null : screenId)}>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-start gap-2 flex-1">
                            <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div className="flex-1">
                              <div className="text-sm font-semibold">{screen.name || screen.url || "Unnamed Screen"}</div>
                              {screen.url && (
                                <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-md">
                                  {screen.url}
                                </div>
                              )}
                              {screen.description && (
                                <div 
                                  className="text-xs text-foreground mt-1 line-clamp-2"
                                  dangerouslySetInnerHTML={{ 
                                    __html: String(screen.description)
                                      .replace(/<br\s*\/?>/gi, '\n')
                                      .replace(/\n{3,}/g, '\n\n')
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 ml-2">
                            {incomingNavigations.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {incomingNavigations.length} from
                              </Badge>
                            )}
                            {navigations.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {navigations.length} to
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-3 pt-3 border-t space-y-3">
                          {/* Incoming Navigation */}
                          {incomingNavigations.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-2">
                                Navigate from:
                              </div>
                              <div className="space-y-1.5">
                                {incomingNavigations.map((nav, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2 text-xs bg-muted/30 rounded p-2"
                                  >
                                    <span className="text-foreground">{nav.sourceScreen.name || "Previous Screen"}</span>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <MousePointerClick className="h-3 w-3 text-primary shrink-0" />
                                    <span className="font-medium text-foreground">
                                      {nav.action.name || "Click"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Outgoing Navigation */}
                          {navigations.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-2">Navigate to:</div>
                              <div className="space-y-1.5">
                                {navigations.map((nav, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2 text-xs bg-muted/30 rounded p-2.5 group hover:bg-muted/50 transition-colors"
                                  >
                                    <MousePointerClick className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <span className="font-medium text-foreground">
                                      {nav.action.name || "Click Action"}
                                    </span>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-foreground flex-1">
                                      {nav.targetScreen.name || "Next Screen"}
                                    </span>
                                    {nav.action.type && (
                                      <Badge variant="secondary" className="text-xs">
                                        {nav.action.type}
                                      </Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {incomingNavigations.length === 0 && navigations.length === 0 && (
                            <div className="text-xs text-muted-foreground">
                              No navigation paths found for this screen
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
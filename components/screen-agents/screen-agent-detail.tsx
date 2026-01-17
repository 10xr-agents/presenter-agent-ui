"use client"

import { Settings } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ShareModal } from "./share-modal"

interface ScreenAgentDetail {
  id: string
  name: string
  description?: string
  status: "draft" | "active" | "paused" | "archived"
  visibility: "private" | "team" | "organization" | "public"
  targetWebsiteUrl: string
  voiceConfig: {
    provider: string
    voiceId: string
    language: string
  }
  totalPresentationCount: number
  totalViewerCount: number
  totalMinutesConsumed: number
  averageSessionDuration: number
  completionRate: number
  shareableToken?: string
  createdAt: string
  updatedAt: string
}

interface ScreenAgentDetailProps {
  agent: ScreenAgentDetail
}

export function ScreenAgentDetail({ agent }: ScreenAgentDetailProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)

  const handlePublish = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/screen-agents/${agent.id}/publish`, {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to publish")

      router.refresh()
    } catch (error: unknown) {
      console.error("Publish error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePause = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/screen-agents/${agent.id}/pause`, {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to pause")

      router.refresh()
    } catch (error: unknown) {
      console.error("Pause error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = (agentStatus: typeof agent.status) => {
    switch (agentStatus) {
      case "active":
        return "default"
      case "paused":
        return "secondary"
      case "draft":
        return "outline"
      case "archived":
        return "destructive"
      default:
        return "outline"
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-semibold">{agent.name}</h1>
            <Badge variant={getStatusColor(agent.status)} className="text-xs capitalize">
              {agent.status}
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">
              {agent.visibility}
            </Badge>
          </div>
          {agent.description && (
            <p className="text-xs text-foreground mt-0.5">{agent.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareModalOpen(true)}
            disabled={agent.status !== "active"}
            className="h-8 text-xs"
          >
            Share
          </Button>
          {agent.status === "draft" && (
            <Button size="sm" onClick={handlePublish} disabled={isLoading} className="h-8 text-xs">
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-3.5 w-3.5" />
                  Publishing...
                </>
              ) : (
                "Publish"
              )}
            </Button>
          )}
          {agent.status === "active" && (
            <Button variant="outline" size="sm" onClick={handlePause} disabled={isLoading} className="h-8 text-xs">
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-3.5 w-3.5" />
                  Pausing...
                </>
              ) : (
                "Pause"
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/screen-agents/${agent.id}/edit`)}
            className="h-8 text-xs"
          >
            <Settings className="mr-2 h-3.5 w-3.5" />
            Edit
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs">Analytics</TabsTrigger>
          <TabsTrigger value="sessions" className="text-xs">Sessions</TabsTrigger>
          <TabsTrigger value="knowledge" className="text-xs">Knowledge</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Presentations</p>
                  <p className="text-2xl font-semibold">{agent.totalPresentationCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Viewers</p>
                  <p className="text-2xl font-semibold">{agent.totalViewerCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Minutes</p>
                  <p className="text-2xl font-semibold">{agent.totalMinutesConsumed}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Avg Duration</p>
                  <p className="text-2xl font-semibold">{agent.averageSessionDuration.toFixed(1)}m</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Target Website</p>
                  <p className="text-xs font-medium">{agent.targetWebsiteUrl}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Voice Provider</p>
                  <p className="text-xs font-medium capitalize">
                    {agent.voiceConfig.provider} - {agent.voiceConfig.voiceId}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Language</p>
                  <p className="text-xs font-medium">{agent.voiceConfig.language}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Analytics</CardTitle>
              <CardDescription className="text-xs">
                View detailed analytics and performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Completion Rate</span>
                    <span className="font-medium">{(agent.completionRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-1.5">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all"
                      style={{ width: `${agent.completionRate * 100}%` }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Analytics dashboard will be implemented in a future phase
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-6">
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Presentation Sessions</CardTitle>
              <CardDescription className="text-xs">
                View and manage presentation sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Session list will be implemented in a future phase
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-6">
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Knowledge Documents</CardTitle>
              <CardDescription className="text-xs">
                Manage knowledge sources for this agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Knowledge documents will be implemented in a future phase
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Settings</CardTitle>
              <CardDescription className="text-xs">
                Agent configuration and metadata
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={getStatusColor(agent.status)} className="text-xs capitalize">
                    {agent.status}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Visibility</p>
                  <Badge variant="outline" className="text-xs capitalize">
                    {agent.visibility}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-xs font-medium">
                    {new Date(agent.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="text-xs font-medium">
                    {new Date(agent.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {agent.shareableToken && (
        <ShareModal
          agentId={agent.id}
          agentName={agent.name}
          shareableToken={agent.shareableToken}
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
        />
      )}
    </div>
  )
}

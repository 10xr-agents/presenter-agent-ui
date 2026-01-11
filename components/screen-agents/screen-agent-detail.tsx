"use client"

import { Loader2, Settings } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <Badge variant={getStatusColor(agent.status)} className="capitalize">
              {agent.status}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {agent.visibility}
            </Badge>
          </div>
          {agent.description && (
            <p className="text-muted-foreground">{agent.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShareModalOpen(true)}
            disabled={agent.status !== "active"}
          >
            Share
          </Button>
          {agent.status === "draft" && (
            <Button onClick={handlePublish} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Publish"
              )}
            </Button>
          )}
          {agent.status === "active" && (
            <Button variant="outline" onClick={handlePause} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Pausing...
                </>
              ) : (
                "Pause"
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => router.push(`/screen-agents/${agent.id}/edit`)}
          >
            <Settings className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Presentations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{agent.totalPresentationCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Viewers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{agent.totalViewerCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Minutes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{agent.totalMinutesConsumed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{agent.averageSessionDuration.toFixed(1)}m</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Target Website</p>
                <p className="text-sm text-muted-foreground">{agent.targetWebsiteUrl}</p>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Voice Provider</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {agent.voiceConfig.provider} - {agent.voiceConfig.voiceId}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Language</p>
                <p className="text-sm text-muted-foreground">{agent.voiceConfig.language}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Completion Rate</p>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${agent.completionRate * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(agent.completionRate * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Analytics dashboard will be implemented in a future phase</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Presentation Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Session list will be implemented in a future phase
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Knowledge Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Knowledge documents will be implemented in a future phase
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Status</p>
                  <Badge variant={getStatusColor(agent.status)} className="capitalize">
                    {agent.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Visibility</p>
                  <Badge variant="outline" className="capitalize">
                    {agent.visibility}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(agent.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Last Updated</p>
                  <p className="text-sm text-muted-foreground">
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

"use client"

import { Loader2, Settings } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
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
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
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

        <TabsContent value="overview" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">Presentations</p>
              <p className="text-xl font-semibold">{agent.totalPresentationCount}</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">Viewers</p>
              <p className="text-xl font-semibold">{agent.totalViewerCount}</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">Minutes</p>
              <p className="text-xl font-semibold">{agent.totalMinutesConsumed}</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-xs text-muted-foreground mb-1">Avg Duration</p>
              <p className="text-xl font-semibold">{agent.averageSessionDuration.toFixed(1)}m</p>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Configuration</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Target Website</p>
                <p className="text-xs">{agent.targetWebsiteUrl}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Voice Provider</p>
                <p className="text-xs capitalize">
                  {agent.voiceConfig.provider} - {agent.voiceConfig.voiceId}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Language</p>
                <p className="text-xs">{agent.voiceConfig.language}</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-3">
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Analytics</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Completion Rate</p>
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full"
                    style={{ width: `${agent.completionRate * 100}%` }}
                  />
                </div>
                <p className="text-xs text-foreground mt-1">
                  {(agent.completionRate * 100).toFixed(1)}%
                </p>
              </div>
              <p className="text-xs text-foreground">
                Analytics dashboard will be implemented in a future phase
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-3">
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Presentation Sessions</h3>
            <p className="text-xs text-foreground">
              Session list will be implemented in a future phase
            </p>
          </div>
        </TabsContent>

        <TabsContent value="knowledge" className="space-y-3">
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Knowledge Documents</h3>
            <p className="text-xs text-foreground">
              Knowledge documents will be implemented in a future phase
            </p>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-3">
          <div className="border rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Settings</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Badge variant={getStatusColor(agent.status)} className="text-xs capitalize">
                  {agent.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Visibility</p>
                <Badge variant="outline" className="text-xs capitalize">
                  {agent.visibility}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                <p className="text-xs">
                  {new Date(agent.createdAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Last Updated</p>
                <p className="text-xs">
                  {new Date(agent.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
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

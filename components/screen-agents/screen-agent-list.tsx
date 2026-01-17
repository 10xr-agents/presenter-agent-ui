"use client"

import { Plus, Search, Video } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScreenAgentCard } from "./screen-agent-card"
import { ShareModal } from "./share-modal"

interface ScreenAgent {
  id: string
  name: string
  description?: string
  status: "draft" | "active" | "paused" | "archived"
  visibility: "private" | "team" | "organization" | "public"
  targetWebsiteUrl: string
  totalPresentationCount: number
  totalViewerCount: number
  totalMinutesConsumed: number
  createdAt: string
  updatedAt: string
  shareableToken?: string
}

interface ScreenAgentListProps {
  initialAgents?: ScreenAgent[]
  organizationId?: string
}

export function ScreenAgentList({
  initialAgents = [],
  organizationId,
}: ScreenAgentListProps) {
  const router = useRouter()
  const [agents, setAgents] = useState<ScreenAgent[]>(initialAgents)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [visibilityFilter, setVisibilityFilter] = useState<string>("all")
  const [selectedAgent, setSelectedAgent] = useState<ScreenAgent | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)

  const handleSearch = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (organizationId) params.set("organizationId", organizationId)
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (visibilityFilter !== "all") params.set("visibility", visibilityFilter)
      if (searchQuery) params.set("q", searchQuery)

      const response = await fetch(`/api/screen-agents?${params.toString()}`)
      if (!response.ok) throw new Error("Failed to fetch agents")

      const data = (await response.json()) as { data?: ScreenAgent[] }
      if (data.data) {
        setAgents(data.data)
      }
    } catch (error: unknown) {
      console.error("Search error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePublish = async (agentId: string) => {
    try {
      const response = await fetch(`/api/screen-agents/${agentId}/publish`, {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to publish")

      router.refresh()
      await handleSearch()
    } catch (error: unknown) {
      console.error("Publish error:", error)
    }
  }

  const handlePause = async (agentId: string) => {
    try {
      const response = await fetch(`/api/screen-agents/${agentId}/pause`, {
        method: "POST",
      })
      if (!response.ok) throw new Error("Failed to pause")

      router.refresh()
      await handleSearch()
    } catch (error: unknown) {
      console.error("Pause error:", error)
    }
  }

  const handleDelete = async (agentId: string) => {
    // This will be handled by ScreenAgentTable's ConfirmationDialog
    // Keep this for backward compatibility if needed
  }

  const handleShare = (agent: ScreenAgent) => {
    setSelectedAgent(agent)
    setShareModalOpen(true)
  }

  const filteredAgents = agents.filter((agent) => {
    if (searchQuery && !agent.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground opacity-60" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch()
              }
            }}
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder="Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Visibility</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="team">Team</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
            <SelectItem value="public">Public</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredAgents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Video className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold">
              {agents.length === 0 ? "No Screen Agents yet" : "No agents match your filters"}
            </EmptyTitle>
            {agents.length === 0 && (
              <>
                <EmptyDescription className="text-xs">
                  Create your first Screen Agent to get started with interactive presentations.
                </EmptyDescription>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/screen-agents/new">
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    Create Your First Agent
                  </Link>
                </Button>
              </>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent) => (
            <ScreenAgentCard
              key={agent.id}
              {...agent}
              createdAt={new Date(agent.createdAt)}
              updatedAt={new Date(agent.updatedAt)}
              onShare={() => handleShare(agent)}
              onEdit={() => router.push(`/screen-agents/${agent.id}/edit`)}
              onPublish={() => handlePublish(agent.id)}
              onPause={() => handlePause(agent.id)}
              onDelete={() => handleDelete(agent.id)}
            />
          ))}
        </div>
      )}

      {selectedAgent && (
        <ShareModal
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          shareableToken={selectedAgent.shareableToken || ""}
          open={shareModalOpen}
          onOpenChange={setShareModalOpen}
        />
      )}
    </div>
  )
}

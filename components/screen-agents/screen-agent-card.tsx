"use client"

import { Copy, ExternalLink, MoreVertical, Pause, Play, Share2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ScreenAgentCardProps {
  id: string
  name: string
  description?: string
  status: "draft" | "active" | "paused" | "archived"
  visibility: "private" | "team" | "organization" | "public"
  targetWebsiteUrl: string
  totalPresentationCount: number
  totalViewerCount: number
  totalMinutesConsumed: number
  createdAt: Date
  updatedAt: Date
  onShare?: () => void
  onEdit?: () => void
  onPublish?: () => void
  onPause?: () => void
  onDelete?: () => void
}

export function ScreenAgentCard({
  id,
  name,
  description,
  status,
  visibility,
  targetWebsiteUrl,
  totalPresentationCount,
  totalViewerCount,
  totalMinutesConsumed,
  createdAt,
  updatedAt,
  onShare,
  onEdit,
  onPublish,
  onPause,
  onDelete,
}: ScreenAgentCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}/present/${id}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error: unknown) {
      console.error("Failed to copy link:", error)
    }
  }

  const getStatusColor = (agentStatus: typeof status) => {
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
    <div className="border rounded-lg bg-muted/30 p-4 space-y-3 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <Link href={`/screen-agents/${id}`} className="block group">
            <h3 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
              {name}
            </h3>
          </Link>
          {description && (
            <p className="text-xs text-foreground opacity-85 truncate mt-0.5 line-clamp-1">
              {description}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
              <MoreVertical className="h-3.5 w-3.5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onShare} className="text-xs">
              <Share2 className="mr-2 h-3.5 w-3.5" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} className="text-xs">
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {status === "draft" && (
              <DropdownMenuItem onClick={onPublish} className="text-xs">
                <Play className="mr-2 h-3.5 w-3.5" />
                Publish
              </DropdownMenuItem>
            )}
            {status === "active" && (
              <DropdownMenuItem onClick={onPause} className="text-xs">
                <Pause className="mr-2 h-3.5 w-3.5" />
                Pause
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onDelete} 
              className="text-xs text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300 focus:bg-red-50 dark:focus:bg-red-950/20 cursor-pointer"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={getStatusColor(status)} className="text-xs capitalize">
          {status}
        </Badge>
        <Badge variant="outline" className="text-xs capitalize">
          {visibility}
        </Badge>
      </div>

      <div className="text-xs text-foreground opacity-85">
        <a
          href={targetWebsiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 hover:text-primary truncate"
        >
          <span className="truncate">{targetWebsiteUrl}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </div>

      <div className="grid grid-cols-3 gap-4 pt-2 border-t">
        <div>
          <div className="text-xl font-semibold">{totalPresentationCount}</div>
          <div className="text-xs text-foreground opacity-85">Presentations</div>
        </div>
        <div>
          <div className="text-xl font-semibold">{totalViewerCount}</div>
          <div className="text-xs text-foreground opacity-85">Viewers</div>
        </div>
        <div>
          <div className="text-xl font-semibold">{totalMinutesConsumed}</div>
          <div className="text-xs text-foreground opacity-85">Minutes</div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <div className="text-xs text-foreground opacity-85">
          Updated {new Date(updatedAt).toLocaleDateString()}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopyLink}
          className="h-7 text-xs"
        >
          <Copy className={`mr-1 h-3 w-3 ${copied ? "text-green-600" : ""}`} />
          {copied ? "Copied!" : "Copy Link"}
        </Button>
      </div>
    </div>
  )
}

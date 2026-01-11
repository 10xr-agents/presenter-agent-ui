"use client"

import { Copy, ExternalLink, MoreVertical, Pause, Play, Share2, Trash2 } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              <Link href={`/screen-agents/${id}`} className="hover:underline">
                {name}
              </Link>
            </CardTitle>
            {description && (
              <CardDescription className="mt-1 line-clamp-2">
                {description}
              </CardDescription>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onShare}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {status === "draft" && (
                <DropdownMenuItem onClick={onPublish}>
                  <Play className="mr-2 h-4 w-4" />
                  Publish
                </DropdownMenuItem>
              )}
              {status === "active" && (
                <DropdownMenuItem onClick={onPause}>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getStatusColor(status)} className="capitalize">
              {status}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {visibility}
            </Badge>
          </div>

          <div className="text-sm text-muted-foreground">
            <a
              href={targetWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              {targetWebsiteUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2 border-t">
            <div>
              <div className="text-2xl font-bold">{totalPresentationCount}</div>
              <div className="text-xs text-muted-foreground">Presentations</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{totalViewerCount}</div>
              <div className="text-xs text-muted-foreground">Viewers</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{totalMinutesConsumed}</div>
              <div className="text-xs text-muted-foreground">Minutes</div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Updated {new Date(updatedAt).toLocaleDateString()}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyLink}
          className="h-8"
        >
          <Copy className={`mr-2 h-3 w-3 ${copied ? "text-green-600" : ""}`} />
          {copied ? "Copied!" : "Copy Link"}
        </Button>
      </CardFooter>
    </Card>
  )
}

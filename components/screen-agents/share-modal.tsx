"use client"

import { Check, Copy, ExternalLink } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

interface ShareModalProps {
  agentId: string
  agentName: string
  shareableToken: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShareModal({
  agentId,
  agentName,
  shareableToken,
  open,
  onOpenChange,
}: ShareModalProps) {
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedEmbed, setCopiedEmbed] = useState(false)
  const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
  const shareUrl = `${baseUrl}/present/${shareableToken}`
  const embedCode = `<iframe src="${shareUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch (error: unknown) {
      console.error("Failed to copy link:", error)
    }
  }

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode)
      setCopiedEmbed(true)
      setTimeout(() => setCopiedEmbed(false), 2000)
    } catch (error: unknown) {
      console.error("Failed to copy embed code:", error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Share Screen Agent</DialogTitle>
          <DialogDescription>
            Share &quot;{agentName}&quot; with others using a link or embed code
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="link">Link</TabsTrigger>
            <TabsTrigger value="embed">Embed</TabsTrigger>
            <TabsTrigger value="qr">QR Code</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="share-url">Shareable Link</Label>
              <div className="flex gap-2">
                <Input id="share-url" value={shareUrl} readOnly className="font-mono text-sm" />
                <Button onClick={handleCopyLink} variant="outline" size="icon">
                  {copiedLink ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can view the Screen Agent presentation
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => window.open(shareUrl, "_blank")}
                className="flex-1"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Link
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="embed" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="embed-code">Embed Code</Label>
              <div className="flex gap-2">
                <Textarea
                  id="embed-code"
                  value={embedCode}
                  readOnly
                  className="font-mono text-sm h-24"
                />
                <Button onClick={handleCopyEmbed} variant="outline" size="icon">
                  {copiedEmbed ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copy and paste this code into your website to embed the Screen Agent
              </p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Preview:</p>
              <div className="border rounded bg-background p-4 text-center text-sm text-muted-foreground">
                Screen Agent Embed Preview
                <br />
                <span className="text-xs">(Actual embed will show here)</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="qr" className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground text-center">
                  QR Code generation will be implemented in a future phase
                </p>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  (Requires QR code library integration)
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center max-w-md">
                QR codes allow users to quickly access your Screen Agent by scanning with their
                mobile device
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { FileText, Link as LinkIcon, Upload, X } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface KnowledgeUploadStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrevious: () => void
}

interface UploadedFile {
  id: string
  name: string
  type: "pdf" | "video" | "audio" | "text" | "url"
  size?: number
  url?: string
  status: "pending" | "processing" | "ready" | "failed"
}

export function KnowledgeUploadStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
}: KnowledgeUploadStepProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [urlInput, setUrlInput] = useState("")
  const [domainRestrictions, setDomainRestrictions] = useState(
    data.domainRestrictions?.join(", ") || ""
  )

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    // TODO: Implement actual file upload with Uploadthing
    // For now, just add to the list
    Array.from(files).forEach((file) => {
      const fileType = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : file.type === "application/pdf"
            ? "pdf"
            : "text"

      setUploadedFiles((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          type: fileType,
          size: file.size,
          status: "pending",
        },
      ])
    })
  }

  const handleAddUrl = () => {
    if (!urlInput.trim()) return

    setUploadedFiles((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        name: urlInput,
        type: "url",
        status: "pending",
        url: urlInput,
      },
    ])
    setUrlInput("")
  }

  const handleRemoveFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== id))
  }

  const handleNext = () => {
    onUpdate({
      knowledgeDocumentIds: uploadedFiles.map((file) => file.id),
      domainRestrictions: domainRestrictions
        ? domainRestrictions.split(",").map((d) => d.trim()).filter(Boolean)
        : undefined,
    })
    onNext()
  }

  return (
    <div className="space-y-6">
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertDescription>
          Upload documents, videos, audio files, or add URLs to provide context for your Screen
          Agent. These will be processed in the background.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="fileUpload">Upload Files</Label>
        <div className="flex items-center gap-2">
          <Input
            id="fileUpload"
            type="file"
            multiple
            accept=".pdf,.mp4,.mov,.mp3,.wav,.txt"
            onChange={handleFileUpload}
            className="cursor-pointer"
          />
          <Upload className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">
          Supported: PDF, Video (MP4, MOV), Audio (MP3, WAV), Text files
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="urlInput" className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4" />
          Add URL
        </Label>
        <div className="flex gap-2">
          <Input
            id="urlInput"
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/docs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAddUrl()
              }
            }}
          />
          <Button type="button" onClick={handleAddUrl} variant="outline">
            Add
          </Button>
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <Label>Uploaded Files</Label>
          <div className="space-y-2 border rounded-lg p-4">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-2 bg-muted rounded"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{file.name}</span>
                  {file.status === "processing" && (
                    <span className="text-xs text-muted-foreground">(Processing...)</span>
                  )}
                  {file.status === "ready" && (
                    <span className="text-xs text-green-600">(Ready)</span>
                  )}
                  {file.status === "failed" && (
                    <span className="text-xs text-destructive">(Failed)</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(file.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="domainRestrictions">Domain Restrictions (Optional)</Label>
        <Input
          id="domainRestrictions"
          value={domainRestrictions}
          onChange={(e) => setDomainRestrictions(e.target.value)}
          placeholder="example.com, subdomain.example.com"
        />
        <p className="text-xs text-muted-foreground">
          Comma-separated list of allowed domains for navigation
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious}>
          Previous
        </Button>
        <Button onClick={handleNext}>
          Next: Agent Personality
        </Button>
      </div>
    </div>
  )
}

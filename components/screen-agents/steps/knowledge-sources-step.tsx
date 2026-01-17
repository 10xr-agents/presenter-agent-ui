"use client"

import { FileText, Upload, X } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface KnowledgeSourcesStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrevious: () => void
  onCreate: (organizationId: string) => Promise<string | null>
  organizationId: string
  isLoading: boolean
  error: string | null
}

interface UploadedFile {
  id: string
  name: string
  type: "pdf" | "video" | "audio" | "text" | "url"
  size?: number
  url?: string
  status: "pending" | "processing" | "ready" | "failed"
}

export function KnowledgeSourcesStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
  onCreate,
  organizationId,
  isLoading,
  error,
}: KnowledgeSourcesStepProps) {
  const router = useRouter()
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [urlInput, setUrlInput] = useState("")

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    // TODO: Implement actual file upload with Uploadthing
    // For now, simulate file upload
    Array.from(files).forEach((file) => {
      const fileType = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : file.type === "application/pdf"
            ? "pdf"
            : "text"

      const newFile: UploadedFile = {
        id: `${Date.now()}-${Math.random()}`,
        name: file.name,
        type: fileType,
        size: file.size,
        status: "pending",
      }

      setUploadedFiles((prev) => [...prev, newFile])

      // Simulate background processing
      setTimeout(() => {
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === newFile.id ? { ...f, status: "processing" } : f))
        )

        setTimeout(() => {
          setUploadedFiles((prev) =>
            prev.map((f) => (f.id === newFile.id ? { ...f, status: "ready" } : f))
          )
        }, 2000)
      }, 500)
    })
  }

  const handleAddUrl = () => {
    if (!urlInput.trim()) return

    const newFile: UploadedFile = {
      id: `${Date.now()}-${Math.random()}`,
      name: urlInput,
      type: "url",
      status: "pending",
      url: urlInput,
    }

    setUploadedFiles((prev) => [...prev, newFile])
    setUrlInput("")

    // Simulate background processing
    setTimeout(() => {
      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === newFile.id ? { ...f, status: "processing" } : f))
      )

      setTimeout(() => {
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === newFile.id ? { ...f, status: "ready" } : f))
        )
      }, 2000)
    }, 500)
  }

  const handleRemoveFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((file) => file.id !== id))
  }

  const handleCreate = async () => {
    onUpdate({
      knowledgeDocumentIds: uploadedFiles.map((file) => file.id),
    })

    const agentId = await onCreate(organizationId)
    if (agentId) {
      router.push(`/screen-agents/${agentId}`)
    }
  }

  const handleNext = () => {
    onUpdate({
      knowledgeDocumentIds: uploadedFiles.map((file) => file.id),
    })
    onNext()
  }

  const processingCount = uploadedFiles.filter((f) => f.status === "processing").length
  const readyCount = uploadedFiles.filter((f) => f.status === "ready").length

  return (
    <div className="space-y-4">
      <Alert className="bg-muted/50 border-muted">
        <AlertDescription className="text-xs text-muted-foreground">
          Upload videos, audio, or documents to help your agent understand your product better. Processing happens in the background—you can create and use your agent immediately.
        </AlertDescription>
      </Alert>

      {uploadedFiles.length === 0 && (
        <div className="text-center py-8 border border-dashed rounded-lg bg-muted/30">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs font-medium mb-1">No knowledge sources added</p>
          <p className="text-xs text-muted-foreground mb-3">
            Add context files to improve your agent&apos;s understanding
          </p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => document.getElementById("fileUpload")?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload Files
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="fileUpload" className="text-sm font-medium">Upload Files</Label>
        <Input
          id="fileUpload"
          type="file"
          multiple
          accept=".pdf,.mp4,.mov,.mp3,.wav,.txt,.doc,.docx"
          onChange={handleFileUpload}
          className="cursor-pointer text-xs"
        />
        <p className="text-xs text-muted-foreground">
          PDF, Video (MP4, MOV), Audio (MP3, WAV), Text, Documents
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="urlInput" className="text-sm font-medium">Add URL</Label>
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
          <Button type="button" onClick={handleAddUrl} variant="outline" size="sm">
            Add
          </Button>
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Uploaded Files</Label>
            {processingCount > 0 && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Spinner className="h-3 w-3" />
                {processingCount} processing
              </span>
            )}
            {readyCount > 0 && (
              <span className="text-xs text-green-600">
                {readyCount} ready
              </span>
            )}
          </div>
          <div className="space-y-1 border rounded-lg p-2 max-h-[240px] overflow-y-auto">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-1.5 bg-muted/50 rounded text-xs"
              >
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{file.name}</span>
                  {file.status === "processing" && (
                    <span className="text-muted-foreground flex items-center gap-1 flex-shrink-0">
                      <Spinner className="h-3 w-3" />
                    </span>
                  )}
                  {file.status === "ready" && (
                    <span className="text-green-600 flex-shrink-0 text-[10px]">Ready</span>
                  )}
                  {file.status === "failed" && (
                    <span className="text-destructive flex-shrink-0 text-[10px]">Failed</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveFile(file.id)}
                  className="flex-shrink-0 h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Files are processed in the background. Your agent can be used immediately.
          </p>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onPrevious} disabled={isLoading} size="sm">
          Previous
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={handleCreate}
            disabled={isLoading}
            size="sm"
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-3.5 w-3.5" />
                Creating...
              </>
            ) : (
              "Create Agent"
            )}
          </Button>
          <Button variant="outline" onClick={handleNext} disabled={isLoading} size="sm">
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

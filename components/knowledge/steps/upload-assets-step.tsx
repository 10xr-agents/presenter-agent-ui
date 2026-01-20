"use client"

import { AlertCircle, FileText, Globe, Upload, Video, X, Music, File } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { AssetType, FileAsset, UrlAsset, Asset } from "@/components/knowledge/knowledge-types"

interface UploadAssetsStepProps {
  assets: Asset[]
  newDocUrl: string
  docUrlError: string | null
  fileError: string | null
  uploadProgress: Record<string, number>
  uploadStatus: Record<string, "uploading" | "success" | "error">
  onUpdate: (data: {
    assets: Asset[]
    newDocUrl: string
  }) => void
  onErrors: (errors: {
    docUrlError: string | null
    fileError: string | null
  }) => void
}

export function UploadAssetsStep({
  assets,
  newDocUrl,
  docUrlError,
  fileError,
  uploadProgress,
  uploadStatus,
  onUpdate,
  onErrors,
}: UploadAssetsStepProps) {
  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return false
    try {
      const urlObj = new URL(url)
      return ["http:", "https:"].includes(urlObj.protocol)
    } catch {
      return false
    }
  }

  const validateFile = (file: File): boolean => {
    const allowedDocTypes = [".md", ".pdf", ".txt", ".html", ".doc", ".docx"]
    const allowedVideoTypes = [".mp4", ".mov", ".avi", ".webm", ".mkv"]
    const allowedAudioTypes = [".mp3", ".wav", ".m4a", ".ogg"]
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf("."))
    
    const isDoc = allowedDocTypes.includes(fileExtension)
    const isVideo = allowedVideoTypes.includes(fileExtension)
    const isAudio = allowedAudioTypes.includes(fileExtension)

    if (!isDoc && !isVideo && !isAudio) {
      onErrors({
        docUrlError: null,
        fileError: `Invalid file type. Allowed: documents (${allowedDocTypes.join(", ")}), videos (${allowedVideoTypes.join(", ")}), audio (${allowedAudioTypes.join(", ")})`,
      })
      return false
    }

    const maxSize = isVideo ? 500 * 1024 * 1024 : 50 * 1024 * 1024
    if (file.size > maxSize) {
      onErrors({
        docUrlError: null,
        fileError: `File size exceeds limit (max: ${maxSize / 1024 / 1024}MB)`,
      })
      return false
    }

    onErrors({
      docUrlError,
      fileError: null,
    })
    return true
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newAssets: Asset[] = []
    
    files.forEach((file) => {
      if (validateFile(file)) {
        const asset: FileAsset = {
          id: `${Date.now()}-${Math.random()}`,
          type: "file",
          file,
          name: file.name,
          size: file.size,
        }
        newAssets.push(asset)
      }
    })

    if (newAssets.length > 0) {
      onUpdate({
        assets: [...assets, ...newAssets],
        newDocUrl,
      })
    }
    e.target.value = ""
  }

  const handleAddDocUrl = () => {
    if (!newDocUrl.trim()) {
      onErrors({
        docUrlError: "Documentation URL is required",
        fileError,
      })
      return
    }
    if (!validateUrl(newDocUrl)) {
      onErrors({
        docUrlError: "Please enter a valid URL (e.g., https://example.com/docs)",
        fileError,
      })
      return
    }
    const asset: UrlAsset = {
      id: `${Date.now()}-${Math.random()}`,
      type: "documentation",
      url: newDocUrl.trim(),
      name: new URL(newDocUrl.trim()).hostname,
    }
    onUpdate({
      assets: [...assets, asset],
      newDocUrl: "",
    })
    onErrors({
      docUrlError: null,
      fileError,
    })
  }


  const handleRemoveAsset = (id: string) => {
    onUpdate({
      assets: assets.filter((asset) => asset.id !== id),
      newDocUrl,
    })
  }

  const getAssetIcon = (asset: Asset) => {
    if (asset.type === "file") {
      const extension = asset.file.name.toLowerCase().substring(asset.file.name.lastIndexOf("."))
      if ([".mp4", ".mov", ".avi", ".webm", ".mkv"].includes(extension)) {
        return <Video className="h-3.5 w-3.5" />
      }
      if ([".mp3", ".wav", ".m4a", ".ogg"].includes(extension)) {
        return <Music className="h-3.5 w-3.5" />
      }
      return <File className="h-3.5 w-3.5" />
    }
    if (asset.type === "documentation") {
      return <FileText className="h-3.5 w-3.5" />
    }
    return <Video className="h-3.5 w-3.5" />
  }

  const getAssetTypeLabel = (asset: Asset) => {
    if (asset.type === "file") {
      const extension = asset.file.name.toLowerCase().substring(asset.file.name.lastIndexOf("."))
      if ([".mp4", ".mov", ".avi", ".webm", ".mkv"].includes(extension)) {
        return "Video File"
      }
      if ([".mp3", ".wav", ".m4a", ".ogg"].includes(extension)) {
        return "Audio File"
      }
      return "Document"
    }
    return "Documentation URL"
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-6 space-y-6">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">Upload Assets</h3>
        <p className="mt-0.5 text-xs text-foreground">
          Upload files or add documentation URLs to include with this knowledge source
        </p>
      </div>

      {/* File Upload */}
      <div className="space-y-2">
        <Label htmlFor="fileUpload" className="text-xs text-muted-foreground">
          Upload Files
        </Label>
        <Input
          id="fileUpload"
          type="file"
          multiple
          accept=".md,.pdf,.txt,.html,.doc,.docx,.mp4,.mov,.avi,.webm,.mkv,.mp3,.wav,.m4a,.ogg"
          onChange={handleFileUpload}
          className="h-9"
        />
        {fileError && (
          <p className="text-xs text-destructive">{fileError}</p>
        )}
        <p className="text-xs text-foreground">
          Supported: Documents (.md, .pdf, .txt, .html, .doc, .docx), Videos (.mp4, .mov, .avi, .webm, .mkv), Audio (.mp3, .wav, .m4a, .ogg)
        </p>
      </div>

      {/* Documentation URL */}
      <div className="space-y-2">
        <Label htmlFor="docUrl" className="text-xs text-muted-foreground">
          Documentation URL
        </Label>
        <div className="flex gap-2">
          <Input
            id="docUrl"
            type="url"
            value={newDocUrl}
            onChange={(e) => {
              onUpdate({
                assets,
                newDocUrl: e.target.value,
              })
              onErrors({
                docUrlError: null,
                fileError,
              })
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAddDocUrl()
              }
            }}
            placeholder="https://example.com/docs"
            className="h-9"
          />
          <Button type="button" variant="outline" size="sm" onClick={handleAddDocUrl}>
            Add
          </Button>
        </div>
        {docUrlError && (
          <p className="text-xs text-destructive">{docUrlError}</p>
        )}
      </div>


      {/* Asset List */}
      {assets.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Added Assets ({assets.length})</Label>
          <div className="space-y-2">
            {assets.map((asset) => {
              const status = uploadStatus[asset.id]
              const progress = uploadProgress[asset.id]
              const isUploading = status === "uploading"
              const isSuccess = status === "success"
              const isError = status === "error"

              return (
                <Card key={asset.id} className="bg-muted/30">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <div className="mt-0.5 shrink-0">
                          {getAssetIcon(asset)}
                        </div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-foreground truncate">
                              {asset.type === "file" ? asset.name : asset.url}
                            </p>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {getAssetTypeLabel(asset)}
                            </Badge>
                          </div>
                          {asset.type === "file" && (
                            <p className="text-xs text-foreground">
                              {formatFileSize(asset.size)}
                            </p>
                          )}
                          {isUploading && progress !== undefined && (
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div
                                className="bg-primary h-1.5 rounded-full transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          )}
                          {isSuccess && (
                            <p className="text-xs text-green-600">Uploaded successfully</p>
                          )}
                          {isError && (
                            <p className="text-xs text-destructive">Upload failed</p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAsset(asset.id)}
                        className="h-6 w-6 p-0 shrink-0"
                        disabled={isUploading}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {assets.length === 0 && (
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <div className="text-center py-4 space-y-3">
              <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-xs text-foreground">
                No assets added yet. Upload files or add URLs above.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      </CardContent>
    </Card>
  )
}

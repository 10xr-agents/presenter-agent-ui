"use client"

import { AlertCircle, CheckCircle2, File, FileText, Globe, Music, Upload, Video, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  KnowledgePathRestrictions,
} from "@/components/knowledge/knowledge-form-fields"
import { KnowledgeProgress } from "@/components/knowledge/knowledge-progress"
import type { Asset, AssetType, FileAsset, UrlAsset } from "@/components/knowledge/knowledge-types"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"

interface KnowledgeCreationFormProps {
  organizationId: string
}

export function KnowledgeCreationForm({ organizationId }: KnowledgeCreationFormProps) {
  const router = useRouter()
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [sourceName, setSourceName] = useState("")
  const [assets, setAssets] = useState<Asset[]>([])
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loginUrl, setLoginUrl] = useState("")
  const [skipAuthentication, setSkipAuthentication] = useState(true)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [includePaths, setIncludePaths] = useState("")
  const [excludePaths, setExcludePaths] = useState("")
  const [maxPages, setMaxPages] = useState<number | "">(100)
  const [maxDepth, setMaxDepth] = useState<number | "">(10)
  const [extractCodeBlocks, setExtractCodeBlocks] = useState(false)
  const [extractThumbnails, setExtractThumbnails] = useState(false)
  const [newDocUrl, setNewDocUrl] = useState("")
  const [urlError, setUrlError] = useState<string | null>(null)
  const [docUrlError, setDocUrlError] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdKnowledgeId, setCreatedKnowledgeId] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [uploadStatus, setUploadStatus] = useState<Record<string, "uploading" | "success" | "error">>({})

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      return false
    }
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
      setFileError(`Invalid file type. Allowed: documents (${allowedDocTypes.join(", ")}), videos (${allowedVideoTypes.join(", ")}), audio (${allowedAudioTypes.join(", ")})`)
      return false
    }

    const maxSize = isVideo ? 500 * 1024 * 1024 : 50 * 1024 * 1024 // 500MB for videos, 50MB for others
    if (file.size > maxSize) {
      setFileError(`File size exceeds limit (max: ${maxSize / 1024 / 1024}MB)`)
      return false
    }

    setFileError(null)
    return true
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    files.forEach((file) => {
      if (validateFile(file)) {
        const asset: FileAsset = {
          id: `${Date.now()}-${Math.random()}`,
          type: "file",
          file,
          name: file.name,
          size: file.size,
        }
        setAssets((prev) => [...prev, asset])
      }
    })
    // Reset input to allow same file to be selected again
    e.target.value = ""
  }

  const handleAddDocUrl = () => {
    if (!newDocUrl.trim()) {
      setDocUrlError("Documentation URL is required")
      return
    }
    if (!validateUrl(newDocUrl)) {
      setDocUrlError("Please enter a valid URL (e.g., https://example.com/docs)")
      return
    }
    const asset: UrlAsset = {
      id: `${Date.now()}-${Math.random()}`,
      type: "documentation",
      url: newDocUrl.trim(),
      name: new URL(newDocUrl.trim()).hostname,
    }
    setAssets((prev) => [...prev, asset])
    setNewDocUrl("")
    setDocUrlError(null)
  }


  const handleRemoveAsset = (id: string) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== id))
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
    if (asset.type === "documentation") {
      return "Documentation URL"
    }
    return "Video URL"
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate website URL
    if (!validateUrl(websiteUrl)) {
      setUrlError("Please enter a valid website URL (e.g., https://example.com)")
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Step 1: Create primary knowledge source with website URL
      const websitePayload = {
        source_type: "website" as const,
        source_url: websiteUrl.trim(),
        source_name: sourceName.trim() || websiteUrl.trim(),
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        options: {
          max_pages: typeof maxPages === "number" ? maxPages : 100,
          max_depth: typeof maxDepth === "number" ? maxDepth : 10,
          ...(!skipAuthentication && username.trim() && password.trim()
            ? {
                credentials: {
                  username: username.trim(),
                  password: password.trim(),
                  ...(loginUrl.trim() && validateUrl(loginUrl.trim())
                    ? { login_url: loginUrl.trim() }
                    : {}),
                },
              }
            : {}),
        },
        websiteCredentials: !skipAuthentication && username.trim() && password.trim()
          ? {
              username: username.trim(),
              password: password.trim(),
            }
          : undefined,
      }

      const websiteResponse = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(websitePayload),
      })

      if (!websiteResponse.ok) {
        const errorData = (await websiteResponse.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to create website knowledge")
      }

      const websiteResult = (await websiteResponse.json()) as { data?: { id: string; jobId?: string | null; workflowId?: string | null } }
      const primaryKnowledgeId = websiteResult.data?.id
      if (!primaryKnowledgeId) {
        throw new Error("No knowledge ID returned from server")
      }

      // Step 2: Handle additional assets
      // Separate files from URLs
      const fileAssets = assets.filter((asset): asset is FileAsset => asset.type === "file")
      const urlAssets = assets.filter((asset): asset is UrlAsset => asset.type !== "file")

      // Batch upload multiple files to S3, then send as single multi-file ingestion request
      if (fileAssets.length > 0) {
        // Generate knowledge ID for batch upload
        const mongoose = await import("mongoose")
        const batchKnowledgeId = new mongoose.Types.ObjectId().toString()

        // Upload all files to S3 first
        const fileUploadPromises = fileAssets.map(async (asset) => {
          setUploadStatus((prev) => ({ ...prev, [asset.id]: "uploading" }))
          setUploadProgress((prev) => ({ ...prev, [asset.id]: 0 }))

          try {
            const formData = new FormData()
            formData.append("file", asset.file)
            formData.append("source_type", "documentation") // Will be determined by backend from file extension
            formData.append("knowledge_id", batchKnowledgeId)

            // Simulate progress
            const fileSizeMB = asset.size / 1024 / 1024
            const estimatedTime = Math.max(1000, fileSizeMB * 200)
            const progressSteps = Math.ceil(estimatedTime / 200)
            let progressStep = 0

            const progressInterval = setInterval(() => {
              progressStep++
              const progress = Math.min(90, (progressStep / progressSteps) * 90)
              setUploadProgress((prev) => ({ ...prev, [asset.id]: Math.round(progress) }))
              if (progressStep >= progressSteps) {
                clearInterval(progressInterval)
              }
            }, 200)

            const uploadResponse = await fetch("/api/knowledge/upload-to-s3", {
              method: "POST",
              body: formData,
            })

            clearInterval(progressInterval)
            setUploadProgress((prev) => ({ ...prev, [asset.id]: 100 }))

            if (!uploadResponse.ok) {
              const errorData = (await uploadResponse.json()) as { error?: string }
              setUploadStatus((prev) => ({ ...prev, [asset.id]: "error" }))
              throw new Error(`Failed to upload ${asset.file.name}: ${errorData.error || "Unknown error"}`)
            }

            setUploadStatus((prev) => ({ ...prev, [asset.id]: "success" }))
            const uploadResult = (await uploadResponse.json()) as {
              data?: {
                s3Reference: {
                  bucket: string
                  key: string
                  region?: string
                  endpoint?: string
                  url?: string
                  presigned_url?: string
                  expires_at?: string
                }
                fileMetadata: {
                  filename: string
                  size: number
                  content_type: string
                  uploaded_at: string
                }
                presignedUrl?: string
                presignedUrlExpiresAt?: string
              }
            }

            // Ensure presigned URL is included in s3Reference
            const s3Ref = uploadResult.data?.s3Reference
            if (s3Ref && !s3Ref.presigned_url) {
              // If presigned_url not in s3Reference, use the separate presignedUrl field or generate one
              if (uploadResult.data?.presignedUrl) {
                s3Ref.presigned_url = uploadResult.data.presignedUrl
                s3Ref.expires_at = uploadResult.data.presignedUrlExpiresAt
              } else {
                // Generate presigned URL if missing
                try {
                  const presignedResponse = await fetch(
                    `/api/knowledge/generate-presigned-url?key=${encodeURIComponent(s3Ref.key)}`
                  )
                  if (presignedResponse.ok) {
                    const presignedData = (await presignedResponse.json()) as { url: string; expiresAt: string }
                    s3Ref.presigned_url = presignedData.url
                    s3Ref.expires_at = presignedData.expiresAt
                  }
                } catch (error: unknown) {
                  console.error("Failed to generate presigned URL", error)
                }
              }
            }

            return {
              asset,
              s3Reference: s3Ref,
              fileMetadata: uploadResult.data?.fileMetadata,
            }
          } catch (error: unknown) {
            setUploadStatus((prev) => ({ ...prev, [asset.id]: "error" }))
            throw error
          }
        })

        const uploadResults = await Promise.all(fileUploadPromises)

        // Filter out failed uploads
        const successfulUploads = uploadResults.filter(
          (r) => r.s3Reference && r.fileMetadata
        ) as Array<{
          asset: FileAsset
          s3Reference: NonNullable<(typeof uploadResults)[0]["s3Reference"]>
          fileMetadata: NonNullable<(typeof uploadResults)[0]["fileMetadata"]>
        }>

        if (successfulUploads.length === 0) {
          throw new Error("No files were successfully uploaded")
        }

        // If multiple files, use multi-file ingestion API
        if (successfulUploads.length > 1) {
          const s3References = successfulUploads.map((r) => r.s3Reference)
          const fileMetadataList = successfulUploads.map((r) => r.fileMetadata)

          const multiFilePayload = {
            source_type: "file" as const,
            source_name: name.trim() || `Batch Upload (${successfulUploads.length} files)`,
            s3_references: s3References,
            file_metadata_list: fileMetadataList,
            name: name.trim() || undefined,
            description: description.trim() || undefined,
          }

          const multiFileResponse = await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(multiFilePayload),
          })

          if (!multiFileResponse.ok) {
            const errorData = (await multiFileResponse.json()) as { error?: string }
            throw new Error(`Failed to create multi-file knowledge: ${errorData.error || "Unknown error"}`)
          }
        } else if (successfulUploads.length === 1) {
          // Single file - use single file flow
          const result = successfulUploads[0]!
          if (!result) {
            throw new Error("Failed to get upload result")
          }

          const singleFilePayload = {
            source_type: "file" as const,
            source_name: result.asset.file.name,
            s3_reference: result.s3Reference,
            file_metadata: result.fileMetadata,
            name: name.trim() ? `${name.trim()} - ${result.asset.file.name}` : undefined,
            description: description.trim() || undefined,
          }

          const singleFileResponse = await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(singleFilePayload),
          })

          if (!singleFileResponse.ok) {
            const errorData = (await singleFileResponse.json()) as { error?: string }
            throw new Error(`Failed to create file knowledge: ${errorData.error || "Unknown error"}`)
          }
        }
      }

      // Handle URL-based assets (documentation/video URLs)
      if (urlAssets.length > 0) {
        const urlPromises = urlAssets.map(async (asset) => {
          const urlPayload = {
            source_type: asset.type,
            source_url: asset.url,
            source_name: asset.name,
            name: name.trim() ? `${name.trim()} - ${asset.name}` : undefined,
            description: description.trim() || undefined,
            options: {
              ...(asset.type === "documentation" && {
                extract_code_blocks: extractCodeBlocks,
              }),
            },
          }

          const urlResponse = await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(urlPayload),
          })

          if (!urlResponse.ok) {
            const errorData = (await urlResponse.json()) as { error?: string }
            throw new Error(`Failed to create ${asset.type} knowledge: ${errorData.error || "Unknown error"}`)
          }

          return await urlResponse.json()
        })

        await Promise.allSettled(urlPromises)
      }

      // Set the primary knowledge ID for progress tracking
      setCreatedKnowledgeId(primaryKnowledgeId)

      // Redirect after a short delay
      setTimeout(() => {
        router.push(`/knowledge/${primaryKnowledgeId}`)
      }, 2000)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create knowledge"
      setError(errorMessage)
    } finally {
      setIsCreating(false)
    }
  }

  const isValid = websiteUrl.trim().length > 0 && !urlError

  if (createdKnowledgeId) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Knowledge created successfully
            </div>
            <p className="text-xs text-foreground">
              Website exploration has started. {assets.length > 0 && `Processing ${assets.length} additional asset${assets.length !== 1 ? "s" : ""}.`}
            </p>
            <KnowledgeProgress
              knowledgeId={createdKnowledgeId}
              jobId={null}
              workflowId={null}
              onComplete={() => {
                router.push(`/knowledge/${createdKnowledgeId}`)
              }}
            />
            <p className="text-xs text-foreground opacity-85">
              You'll be redirected to the knowledge detail page shortly to view progress and results.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Name & Description */}
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Basic Information</h3>
          <p className="text-xs text-foreground opacity-85">
            Provide a name and description for this knowledge source
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Knowledge Source"
            className="h-9"
          />
          <p className="text-xs text-foreground opacity-85">
            A friendly name for this knowledge source
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs text-muted-foreground">
            Description
          </Label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this knowledge source"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            rows={3}
          />
          <p className="text-xs text-foreground opacity-85">
            Optional description to help identify this knowledge source
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sourceName" className="text-xs text-muted-foreground">
            Source Name
          </Label>
          <Input
            id="sourceName"
            type="text"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="Optional: Custom name for this source"
            className="h-9"
          />
          <p className="text-xs text-foreground opacity-85">
            Optional internal identifier for this source
          </p>
        </div>
      </div>

      <Separator />

      {/* Section 2: Website & Authentication */}
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Website Source</h3>
          <p className="text-xs text-foreground opacity-85">
            The primary website to extract knowledge from (required)
          </p>
        </div>

        {/* Website URL */}
        <div className="space-y-1.5">
          <Label htmlFor="websiteUrl" className="text-xs text-muted-foreground">
            Website URL <span className="text-destructive">*</span>
          </Label>
          <Input
            id="websiteUrl"
            type="url"
            value={websiteUrl}
            onChange={(e) => {
              setWebsiteUrl(e.target.value)
              if (e.target.value.trim()) {
                if (!validateUrl(e.target.value)) {
                  setUrlError("Please enter a valid URL (e.g., https://example.com)")
                } else {
                  setUrlError(null)
                }
              } else {
                setUrlError(null)
              }
            }}
            onBlur={() => {
              if (!validateUrl(websiteUrl)) {
                setUrlError("Please enter a valid website URL")
              }
            }}
            placeholder="https://example.com"
            required
            className={`h-9 ${urlError ? "border-destructive" : ""}`}
          />
          {urlError ? (
            <p className="text-xs text-destructive">{urlError}</p>
          ) : (
            <p className="text-xs text-foreground opacity-85">
              The website to extract knowledge from
            </p>
          )}
        </div>

        {/* Authentication (Website Only) */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h4 className="text-sm font-semibold">Authentication</h4>
              <p className="text-xs text-foreground opacity-85">
                Optional. Most websites can be processed without credentials.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSkipAuthentication(!skipAuthentication)}
              className="shrink-0"
            >
              {skipAuthentication ? "Add Credentials" : "Skip"}
            </Button>
          </div>

          {!skipAuthentication && (
            <div className="space-y-3">
              <Alert className="bg-muted/50 border-muted py-2">
                <AlertDescription className="text-xs text-foreground">
                  Credentials are encrypted and stored securely. 2FA/OTP is not supported.
                </AlertDescription>
              </Alert>

              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs text-muted-foreground">
                  Username or Email
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="demo@example.com"
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="h-9"
                />
                <p className="text-xs text-foreground opacity-85">
                  2FA/OTP not supported.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="loginUrl" className="text-xs text-muted-foreground">
                  Login URL (Optional)
                </Label>
                <Input
                  id="loginUrl"
                  type="url"
                  value={loginUrl}
                  onChange={(e) => setLoginUrl(e.target.value)}
                  placeholder="https://example.com/login"
                  className="h-9"
                />
                <p className="text-xs text-foreground opacity-85">
                  Optional. If not provided, the crawler will auto-detect the login page.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Section 3: Additional Assets */}
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Additional Assets</h3>
          <p className="text-xs text-foreground opacity-85">
            Upload files or add documentation URLs to include with this knowledge source
          </p>
        </div>

        {/* File Upload */}
        <div className="space-y-1.5">
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
          <p className="text-xs text-foreground opacity-85">
            Supported: Documents (.md, .pdf, .txt, .html, .doc, .docx), Videos (.mp4, .mov, .avi, .webm, .mkv), Audio (.mp3, .wav, .m4a, .ogg)
          </p>
        </div>

        {/* Documentation URL */}
        <div className="space-y-1.5">
          <Label htmlFor="docUrl" className="text-xs text-muted-foreground">
            Documentation URL
          </Label>
          <div className="flex gap-2">
            <Input
              id="docUrl"
              type="url"
              value={newDocUrl}
              onChange={(e) => {
                setNewDocUrl(e.target.value)
                setDocUrlError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleAddDocUrl()
                }
              }}
              placeholder="https://docs.example.com"
              className={`h-9 flex-1 ${docUrlError ? "border-destructive" : ""}`}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddDocUrl}
              disabled={!newDocUrl.trim()}
            >
              Add
            </Button>
          </div>
          {docUrlError && (
            <p className="text-xs text-destructive">{docUrlError}</p>
          )}
        </div>

        {/* Assets List */}
        {assets.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs text-muted-foreground">
              Added Assets ({assets.length})
            </Label>
            <div className="space-y-2">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded-md border"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getAssetIcon(asset)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium truncate">
                          {asset.type === "file" ? asset.file.name : asset.url}
                        </p>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {getAssetTypeLabel(asset)}
                        </Badge>
                      </div>
                      {asset.type === "file" && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            {(asset.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          {uploadStatus[asset.id] === "uploading" && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Uploading to S3...</span>
                                <span className="text-muted-foreground">{uploadProgress[asset.id] || 0}%</span>
                              </div>
                              <div className="h-1 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all duration-300"
                                  style={{ width: `${uploadProgress[asset.id] || 0}%` }}
                                />
                              </div>
                            </div>
                          )}
                          {uploadStatus[asset.id] === "success" && (
                            <p className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Uploaded to S3
                            </p>
                          )}
                          {uploadStatus[asset.id] === "error" && (
                            <p className="text-xs text-destructive flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Upload failed
                            </p>
                          )}
                        </div>
                      )}
                      {asset.type !== "file" && (
                        <p className="text-xs text-muted-foreground">
                          URL
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAsset(asset.id)}
                    className="h-7 w-7 p-0 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Advanced Options */}
      <div>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="advanced" className="border-none">
            <AccordionTrigger>
              <div className="flex-1 text-left space-y-0.5">
                <div className="text-sm font-semibold">Advanced Options</div>
                <div className="text-xs font-normal opacity-85">
                  Depth, page limits, path restrictions, and extraction options
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-2 space-y-4">
                {/* Website-specific options */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="maxPages" className="text-xs text-muted-foreground">
                      Max Pages
                    </Label>
                    <Input
                      id="maxPages"
                      type="number"
                      min="1"
                      max="1000"
                      value={maxPages}
                      onChange={(e) => {
                        const value = e.target.value
                        setMaxPages(value === "" ? "" : parseInt(value, 10))
                      }}
                      placeholder="100"
                      className="h-9"
                    />
                    <p className="text-xs text-foreground opacity-85">
                      Maximum number of pages to process (default: 100)
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="maxDepth" className="text-xs text-muted-foreground">
                      Max Depth
                    </Label>
                    <Input
                      id="maxDepth"
                      type="number"
                      min="1"
                      max="20"
                      value={maxDepth}
                      onChange={(e) => {
                        const value = e.target.value
                        setMaxDepth(value === "" ? "" : parseInt(value, 10))
                      }}
                      placeholder="10"
                      className="h-9"
                    />
                    <p className="text-xs text-foreground opacity-85">
                      Maximum crawl depth from start URL (default: 10)
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <KnowledgePathRestrictions
                    includePaths={includePaths}
                    excludePaths={excludePaths}
                    onIncludePathsChange={setIncludePaths}
                    onExcludePathsChange={setExcludePaths}
                  />
                </div>

                <Separator />

                {/* Documentation-specific options */}
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="extractCodeBlocks"
                      checked={extractCodeBlocks}
                      onCheckedChange={(checked) => setExtractCodeBlocks(checked === true)}
                    />
                    <Label htmlFor="extractCodeBlocks" className="text-xs text-foreground cursor-pointer">
                      Extract code blocks from documentation
                    </Label>
                  </div>
                  <p className="text-xs text-foreground opacity-85">
                    Extract and index code blocks from documentation URLs
                  </p>
                </div>

                <Separator />

                {/* Video-specific options */}
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="extractThumbnails"
                      checked={extractThumbnails}
                      onCheckedChange={(checked) => setExtractThumbnails(checked === true)}
                    />
                    <Label htmlFor="extractThumbnails" className="text-xs text-foreground cursor-pointer">
                      Extract thumbnails from videos
                    </Label>
                  </div>
                  <p className="text-xs text-foreground opacity-85">
                    Extract and index video thumbnails
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <div className="space-y-1">
              <p className="font-medium">Failed to create knowledge</p>
              <p>{error}</p>
              <p className="opacity-85">
                Please check your website URL and try again. If the issue persists, verify the services are running.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isCreating}
          size="sm"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || isCreating} size="sm">
          {isCreating ? (
            <>
              <Spinner className="mr-2 h-3.5 w-3.5" />
              Creating...
            </>
          ) : (
            "Create Knowledge"
          )}
        </Button>
      </div>
    </form>
  )
}

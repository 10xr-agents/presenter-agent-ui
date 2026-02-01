import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  generateS3Key,
  getFileSizeLimit,
  uploadFileToS3,
  validateFileType,
} from "@/lib/storage/s3-client"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

/**
 * POST /api/knowledge/upload-to-s3
 * Upload a file to S3 and return S3 reference
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get tenant state and organization ID
  const tenantState = await getTenantOperatingMode(session.user.id)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }
  
  // In normal mode, use user ID; in organization mode, use organization ID
  const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const sourceType = formData.get("source_type") as "documentation" | "video" | "audio" | "data" | null
    const knowledgeId = formData.get("knowledge_id") as string | null // Optional, for resyncs

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 })
    }

    if (!sourceType || !["documentation", "video", "audio", "data"].includes(sourceType)) {
      return NextResponse.json(
        { error: "source_type must be 'documentation', 'video', 'audio', or 'data'" },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes: Record<string, string[]> = {
      documentation: [".pdf", ".md", ".txt", ".html", ".docx", ".pptx"],
      video: [".mp4", ".mov", ".avi", ".webm", ".mkv"],
      audio: [".mp3", ".wav", ".ogg", ".m4a"],
      data: [".yaml", ".yml", ".json", ".xml", ".js", ".ts", ".py", ".java", ".cpp"],
    }

    const allowedFileTypes = allowedTypes[sourceType] || []
    if (!validateFileType(file.name, file.type, allowedFileTypes)) {
      return NextResponse.json(
        { error: `Invalid file type for ${sourceType}. Allowed: ${allowedFileTypes.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate file size
    const maxSize = getFileSizeLimit(sourceType)
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds limit (max: ${maxSize / 1024 / 1024}MB)` },
        { status: 413 }
      )
    }

    // Generate S3 key
    // Use provided knowledgeId if available (for resyncs), otherwise generate actual MongoDB ObjectId
    let finalKnowledgeId: string
    if (knowledgeId) {
      finalKnowledgeId = knowledgeId
    } else {
      const mongoose = await import("mongoose")
      finalKnowledgeId = new mongoose.Types.ObjectId().toString()
    }
    const s3Key = generateS3Key(knowledgeOrgId, finalKnowledgeId, file.name)

    console.log("[Knowledge] Uploading file to S3", {
      sourceType,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      s3Key,
      organizationId: knowledgeOrgId,
    })

    try {
      // Upload to S3
      const uploadResult = await uploadFileToS3(
        file,
        s3Key,
        file.type,
        {
          "original-filename": file.name,
          "source-type": sourceType,
          "organization-id": knowledgeOrgId,
          "knowledge-id": finalKnowledgeId,
        }
      )

      console.log("[Knowledge] File uploaded to S3 successfully", {
        s3Key,
        bucket: uploadResult.s3Reference.bucket,
        size: uploadResult.fileMetadata.size,
      })

      return NextResponse.json({
        data: {
          s3Reference: {
            ...uploadResult.s3Reference,
            presigned_url: uploadResult.presignedUrl,
            expires_at: uploadResult.presignedUrlExpiresAt?.toISOString(),
          },
          fileMetadata: {
            filename: uploadResult.fileMetadata.originalFilename,
            size: uploadResult.fileMetadata.size,
            content_type: uploadResult.fileMetadata.contentType,
            uploaded_at: uploadResult.fileMetadata.uploadedAt.toISOString(),
          },
          presignedUrl: uploadResult.presignedUrl,
          presignedUrlExpiresAt: uploadResult.presignedUrlExpiresAt?.toISOString(),
        },
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("[Knowledge] Failed to upload file to S3", {
        sourceType,
        fileName: file.name,
        error: errorMessage,
      })
      Sentry.captureException(error, {
        tags: {
          operation: "upload_file_to_s3",
          sourceType,
          organizationId: knowledgeOrgId,
        },
      })
      return NextResponse.json(
        { error: errorMessage || "Failed to upload file to S3" },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    console.error("S3 upload error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    Sentry.captureException(error, {
      tags: {
        operation: "upload_to_s3",
        organizationId: knowledgeOrgId,
      },
    })
    return NextResponse.json(
      { error: errorMessage || "Failed to process file upload" },
      { status: 500 }
    )
  }
}

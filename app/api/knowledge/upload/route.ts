import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { connectDB } from "@/lib/db/mongoose"
import type { IKnowledgeDocument } from "@/lib/models/knowledge-document"
import { KnowledgeDocument } from "@/lib/models/knowledge-document"
import { queueProcessing } from "@/lib/queue"

/**
 * POST /api/knowledge/upload - Create knowledge document record after upload
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json()) as {
    screenAgentId?: string
    documentType?: "pdf" | "video" | "audio" | "text" | "url"
    originalFilename?: string
    storageLocation?: string
    fileSizeBytes?: number
    url?: string
  }

  const {
    screenAgentId,
    documentType,
    originalFilename,
    storageLocation,
    fileSizeBytes,
    url,
  } = body

  if (!screenAgentId) {
    return NextResponse.json(
      { error: "screenAgentId is required" },
      { status: 400 }
    )
  }

  if (!documentType) {
    return NextResponse.json(
      { error: "documentType is required" },
      { status: 400 }
    )
  }

  try {
    await connectDB()

    // Determine storage location and filename
    const finalStorageLocation = url || storageLocation || ""
    const finalFilename = originalFilename || (url ? url : "unknown")

    // Create knowledge document record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const document = await (KnowledgeDocument as any).create({
      screenAgentId,
      documentType,
      originalFilename: finalFilename,
      storageLocation: finalStorageLocation,
      fileSizeBytes: fileSizeBytes || 0,
      status: "pending",
      timesReferenced: 0,
    })

    // Queue background processing job
    await queueProcessing({
      userId: session.user.id,
      taskId: document._id.toString(),
      payload: {
        knowledgeDocumentId: document._id.toString(),
        documentType,
        storageLocation: finalStorageLocation,
      },
    })

    return NextResponse.json(
      {
        document: {
          id: document._id.toString(),
          screenAgentId: document.screenAgentId,
          documentType: document.documentType,
          originalFilename: document.originalFilename,
          status: document.status,
          createdAt: document.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error("Knowledge upload error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to create knowledge document" },
      { status: 500 }
    )
  }
}

/**
 * GET /api/knowledge/upload - List knowledge documents for a screen agent
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const screenAgentId = searchParams.get("screenAgentId")
  const status = searchParams.get("status")

  if (!screenAgentId) {
    return NextResponse.json(
      { error: "screenAgentId is required" },
      { status: 400 }
    )
  }

  try {
    await connectDB()

    const query: {
      screenAgentId: string
      status?: "pending" | "processing" | "ready" | "failed"
    } = {
      screenAgentId,
    }

    if (status) {
      query.status = status as "pending" | "processing" | "ready" | "failed"
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const documents = await (KnowledgeDocument as any)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)

    return NextResponse.json({
      documents: documents.map((doc: IKnowledgeDocument) => ({
        id: doc._id.toString(),
        screenAgentId: doc.screenAgentId,
        documentType: doc.documentType,
        originalFilename: doc.originalFilename,
        status: doc.status,
        fileSizeBytes: doc.fileSizeBytes,
        processingError: doc.processingError,
        summary: doc.summary,
        keyTopics: doc.keyTopics,
        timesReferenced: doc.timesReferenced,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      })),
    })
  } catch (error: unknown) {
    console.error("Knowledge list error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: errorMessage || "Failed to list knowledge documents" },
      { status: 500 }
    )
  }
}

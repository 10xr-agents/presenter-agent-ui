import { beforeAll, describe, expect, it } from "vitest"
import { connectDB } from "../db/mongoose"
import { KnowledgeDocument } from "../models/knowledge-document"

function generateId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

describe("Knowledge Document Model", () => {
  beforeAll(async () => {
    await connectDB()
  })

  it("should create a knowledge document with required fields", async () => {
    const docData = {
      screenAgentId: generateId(),
      documentType: "pdf" as const,
      originalFilename: "test-document.pdf",
      storageLocation: "s3://bucket/test-document.pdf",
      fileSizeBytes: 1024 * 1024, // 1MB
      status: "pending" as const,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (KnowledgeDocument as any).create(docData)

    expect(doc).toBeDefined()
    expect(doc.documentType).toBe("pdf")
    expect(doc.status).toBe("pending")
    expect(doc.timesReferenced).toBe(0)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (KnowledgeDocument as any).deleteOne({ _id: doc._id })
  })

  it("should store processed data when available", async () => {
    const docData = {
      screenAgentId: generateId(),
      documentType: "text" as const,
      originalFilename: "test.txt",
      storageLocation: "s3://bucket/test.txt",
      fileSizeBytes: 512,
      status: "ready" as const,
      extractedTextContent: "This is test content",
      summary: "Test document summary",
      keyTopics: ["topic1", "topic2"],
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (KnowledgeDocument as any).create(docData)

    expect(doc.extractedTextContent).toBe("This is test content")
    expect(doc.summary).toBe("Test document summary")
    expect(doc.keyTopics).toEqual(["topic1", "topic2"])

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (KnowledgeDocument as any).deleteOne({ _id: doc._id })
  })

  it("should track usage and relevance", async () => {
    const docData = {
      screenAgentId: generateId(),
      documentType: "video" as const,
      originalFilename: "test-video.mp4",
      storageLocation: "s3://bucket/test-video.mp4",
      fileSizeBytes: 50 * 1024 * 1024, // 50MB
      status: "ready" as const,
      timesReferenced: 10,
      relevanceScore: 85,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (KnowledgeDocument as any).create(docData)

    expect(doc.timesReferenced).toBe(10)
    expect(doc.relevanceScore).toBe(85)

    // Cleanup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (KnowledgeDocument as any).deleteOne({ _id: doc._id })
  })
})

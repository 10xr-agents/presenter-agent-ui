import { type Job } from "bullmq"
import { processKnowledgeDocument } from "@/lib/knowledge/processor"

export interface KnowledgeProcessingJobData {
  knowledgeDocumentId: string
  documentType: "pdf" | "video" | "audio" | "text" | "url"
  storageLocation: string
}

/**
 * Process knowledge document job
 */
export async function processKnowledgeProcessingJob(
  job: Job<KnowledgeProcessingJobData>
): Promise<{ success: boolean; message: string }> {
  const { knowledgeDocumentId, documentType, storageLocation } = job.data

  console.log(
    `Processing knowledge document job ${job.id}: ${knowledgeDocumentId} (${documentType})`
  )

  try {
    // Update progress
    await job.updateProgress(10)

    // Process the document
    const result = await processKnowledgeDocument(
      knowledgeDocumentId,
      documentType,
      storageLocation
    )

    await job.updateProgress(100)

    if (result.error) {
      return {
        success: false,
        message: `Knowledge document processing failed: ${result.error}`,
      }
    }

    console.log(
      `Knowledge document ${knowledgeDocumentId} processed successfully`
    )
    return {
      success: true,
      message: `Knowledge document ${knowledgeDocumentId} processed successfully`,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(`Knowledge processing job ${job.id} failed:`, error)
    throw new Error(`Knowledge processing failed: ${message}`)
  }
}

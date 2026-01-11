import { type Job } from "bullmq"
import { analyzeSessionRecording } from "@/lib/analytics/video-analyzer"

export interface VideoAnalysisJobData {
  sessionRecordingId: string
  recordingUrl: string
  presentationSessionId: string
  screenAgentId: string
  organizationId: string
}

/**
 * Process video analysis job
 */
export async function processVideoAnalysisJob(
  job: Job<VideoAnalysisJobData>
): Promise<{ success: boolean; message: string }> {
  const { sessionRecordingId, recordingUrl, presentationSessionId, screenAgentId, organizationId } = job.data

  console.log(
    `Processing video analysis job ${job.id}: ${sessionRecordingId} (${presentationSessionId})`
  )

  try {
    // Update progress
    await job.updateProgress(10)

    // Analyze the recording
    const result = await analyzeSessionRecording(
      sessionRecordingId,
      recordingUrl,
      presentationSessionId,
      screenAgentId,
      organizationId
    )

    await job.updateProgress(100)

    if (result.error) {
      return {
        success: false,
        message: `Video analysis failed: ${result.error}`,
      }
    }

    console.log(
      `Video analysis ${sessionRecordingId} completed successfully`
    )
    return {
      success: true,
      message: `Video analysis ${sessionRecordingId} completed successfully`,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(`Video analysis job ${job.id} failed:`, error)
    throw new Error(`Video analysis failed: ${message}`)
  }
}

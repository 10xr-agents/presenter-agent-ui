import { connectDB } from "@/lib/db/mongoose"
import { AnalyticsEvent } from "@/lib/models/analytics-event"
import { SessionRecording } from "@/lib/models/session-recording"
import { generateInsights } from "./insights-generator"
import { clusterQuestions } from "./question-clustering"
import { extractTopics } from "./topic-extraction"

export interface AnalysisResult {
  success: boolean
  clusteredQuestions?: Array<{
    question: string
    count: number
    sessions: string[]
    topic?: string
  }>
  extractedTopics?: string[]
  insights?: {
    summary: string
    keyFindings: string[]
    recommendations?: string[]
  }
  error?: string
}

/**
 * Analyze a session recording
 * This function orchestrates the analysis pipeline:
 * 1. Cluster questions from analytics events
 * 2. Extract topics from the session
 * 3. Generate insights and recommendations
 */
export async function analyzeSessionRecording(
  sessionRecordingId: string,
  recordingUrl: string,
  presentationSessionId: string,
  screenAgentId: string,
  organizationId: string
): Promise<AnalysisResult> {
  await connectDB()

  // Get recording
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recording = await (SessionRecording as any).findById(sessionRecordingId)
  if (!recording) {
    throw new Error("Session recording not found")
  }

  // Update status to processing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (SessionRecording as any).findByIdAndUpdate(sessionRecordingId, {
    $set: { analysisStatus: "processing" },
  })

  try {
    // Get all analytics events for this session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const events = await (AnalyticsEvent as any).find({
      sessionId: presentationSessionId,
    })

    // Step 1: Cluster questions
    console.log(`Clustering questions for session: ${presentationSessionId}`)
    const clusteredQuestions = await clusterQuestions(events, screenAgentId, organizationId)

    // Step 2: Extract topics
    console.log(`Extracting topics for session: ${presentationSessionId}`)
    const extractedTopics = await extractTopics(events, recordingUrl, screenAgentId, organizationId)

    // Step 3: Generate insights
    console.log(`Generating insights for session: ${presentationSessionId}`)
    const insights = await generateInsights(
      events,
      clusteredQuestions,
      extractedTopics,
      screenAgentId,
      organizationId
    )

    // Update recording with analysis results
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (SessionRecording as any).findByIdAndUpdate(sessionRecordingId, {
      $set: {
        analysisStatus: "completed",
        clusteredQuestions,
        extractedTopics,
        insights,
        processedAt: new Date(),
      },
    })

    return {
      success: true,
      clusteredQuestions,
      extractedTopics,
      insights,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`Error analyzing session recording ${sessionRecordingId}:`, error)
    // Update recording status to failed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (SessionRecording as any).findByIdAndUpdate(sessionRecordingId, {
      $set: { analysisStatus: "failed", analysisError: errorMessage },
    })
    return { success: false, error: errorMessage }
  }
}

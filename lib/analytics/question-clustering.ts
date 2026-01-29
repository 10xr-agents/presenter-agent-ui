import type { IAnalyticsEvent } from "@/lib/models/analytics-event"

export interface ClusteredQuestion {
  question: string
  count: number
  sessions: string[]
  topic?: string
}

/**
 * Cluster similar questions from analytics events
 * 
 * This is a placeholder function. In a real application, you would use an AI/ML service
 * like Gemini embeddings + clustering algorithm, or a dedicated NLP service to:
 * 1. Generate embeddings for each question
 * 2. Cluster similar questions using k-means or hierarchical clustering
 * 3. Group questions that are semantically similar
 * 4. Optionally assign topics to each cluster
 */
export async function clusterQuestions(
  events: IAnalyticsEvent[],
  screenAgentId: string,
  organizationId: string
): Promise<ClusteredQuestion[]> {
  console.log(`[Question Clustering] Processing ${events.length} events for clustering`)

  // Extract all questions from events
  const questionMap = new Map<string, { count: number; sessions: Set<string> }>()
  
  for (const event of events) {
    if (event.eventType === "viewer_question") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const question = (event.properties as any)?.questionText || "Unknown"
      if (!questionMap.has(question)) {
        questionMap.set(question, { count: 0, sessions: new Set() })
      }
      const data = questionMap.get(question)!
      data.count++
      data.sessions.add(event.presentationSessionId)
    }
  }

  // TODO: Implement actual clustering using AI/ML
  // Example with Gemini or embeddings API:
  // 1. Generate embeddings for each unique question
  // 2. Use a clustering algorithm (k-means, DBSCAN, etc.) to group similar questions
  // 3. For each cluster, merge the questions and update counts/sessions
  // 4. Optionally use topic modeling to assign topics to clusters

  // For now, return questions grouped by exact match
  const clustered: ClusteredQuestion[] = Array.from(questionMap.entries()).map(([question, data]) => ({
    question,
    count: data.count,
    sessions: Array.from(data.sessions),
    topic: undefined, // Would be assigned by topic modeling
  }))

  // Sort by count (most asked first)
  clustered.sort((a, b) => b.count - a.count)

  console.log(`[Question Clustering] Clustered ${clustered.length} unique questions`)
  return clustered
}

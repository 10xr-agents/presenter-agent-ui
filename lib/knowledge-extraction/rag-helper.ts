import { connectDB } from "@/lib/db/mongoose"
import { AllowedDomain } from "@/lib/models"
import { matchesDomainPattern } from "@/lib/utils/domain-match"
import { fetchResolveFromExtractionService } from "./resolve-client"
import type { ResolveKnowledgeChunk, ResolveCitation } from "./resolve-client"

/**
 * RAG result with knowledge chunks and org-specific flag.
 */
export interface RAGResult {
  chunks: ResolveKnowledgeChunk[]
  citations?: ResolveCitation[]
  hasOrgKnowledge: boolean
}

/**
 * Get RAG chunks for a given URL/query, using allowed_domains filter.
 *
 * Reused by both:
 * - GET /api/knowledge/resolve (Task 2) - returns chunks to client
 * - POST /api/agent/interact (Task 3) - injects chunks into LLM prompt
 *
 * @param url - Active tab URL (required)
 * @param query - Optional query for relevance filtering
 * @param tenantId - Tenant ID (userId or organizationId) for isolation
 * @returns RAG result with chunks and hasOrgKnowledge flag
 */
export async function getRAGChunks(
  url: string,
  query: string | undefined,
  tenantId: string
): Promise<RAGResult> {
  const domain = new URL(url).hostname

  await connectDB()

  // Check allowed_domains filter (same logic as Task 2)
  const rows = await (AllowedDomain as any)
    .find({ tenantId })
    .select("domainPattern")
    .lean()
    .exec() as { domainPattern: string }[]

  const allowedPatterns = Array.isArray(rows) ? rows : []
  const domainMatches = allowedPatterns.some((r: { domainPattern: string }) =>
    matchesDomainPattern(domain, r.domainPattern)
  )

  if (!domainMatches) {
    // Public knowledge only - no extraction call
    return {
      chunks: [],
      citations: [],
      hasOrgKnowledge: false,
    }
  }

  // Org-specific: call extraction service
  try {
    const { context, citations } = await fetchResolveFromExtractionService(
      url,
      query,
      tenantId
    )
    return {
      chunks: Array.isArray(context) ? context : [],
      citations: Array.isArray(citations) ? citations : [],
      hasOrgKnowledge: true,
    }
  } catch (error: unknown) {
    // On extraction service error, fall back to public-only
    // Log error but don't fail the request
    console.error("[getRAGChunks] Extraction service error:", error)
    return {
      chunks: [],
      citations: [],
      hasOrgKnowledge: false,
    }
  }
}

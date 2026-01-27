import { connectDB } from "@/lib/db/mongoose"
import { AllowedDomain } from "@/lib/models"
import { matchesDomainPattern } from "@/lib/utils/domain-match"
import { fetchResolveFromExtractionService } from "./resolve-client"
import type { ResolveKnowledgeChunk, ResolveCitation } from "./resolve-client"

/**
 * RAG debug information for debug UI.
 */
export interface RAGDebug {
  hasOrgKnowledge: boolean
  activeDomain: string
  domainMatch: boolean
  ragMode: "org_specific" | "public_only"
  reason: string
  chunkCount: number
  allowedDomains?: string[]
}

/**
 * RAG result with knowledge chunks and org-specific flag.
 */
export interface RAGResult {
  chunks: ResolveKnowledgeChunk[]
  citations?: ResolveCitation[]
  hasOrgKnowledge: boolean
  ragDebug?: RAGDebug
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
  const allowedDomainPatterns = allowedPatterns.map((r: { domainPattern: string }) => r.domainPattern)
  const domainMatches = allowedPatterns.some((r: { domainPattern: string }) =>
    matchesDomainPattern(domain, r.domainPattern)
  )

  if (!domainMatches) {
    // Public knowledge only - no extraction call
    const ragDebug: RAGDebug = {
      hasOrgKnowledge: false,
      activeDomain: domain,
      domainMatch: false,
      ragMode: "public_only",
      reason: `Using public knowledge only. Domain "${domain}" is not configured for organization-specific knowledge.`,
      chunkCount: 0,
      allowedDomains: allowedDomainPatterns.length > 0 ? allowedDomainPatterns : undefined,
    }
    return {
      chunks: [],
      citations: [],
      hasOrgKnowledge: false,
      ragDebug,
    }
  }

  // Org-specific: call extraction service
  try {
    const { context, citations } = await fetchResolveFromExtractionService(
      url,
      query,
      tenantId
    )
    const chunks = Array.isArray(context) ? context : []
    const ragDebug: RAGDebug = {
      hasOrgKnowledge: true,
      activeDomain: domain,
      domainMatch: true,
      ragMode: "org_specific",
      reason: `Domain "${domain}" matches allowed_domains pattern. Using org-specific knowledge.`,
      chunkCount: chunks.length,
      allowedDomains: allowedDomainPatterns.length > 0 ? allowedDomainPatterns : undefined,
    }
    return {
      chunks,
      citations: Array.isArray(citations) ? citations : [],
      hasOrgKnowledge: true,
      ragDebug,
    }
  } catch (error: unknown) {
    // On extraction service error, fall back to public-only
    // Log error but don't fail the request
    console.error("[getRAGChunks] Extraction service error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const ragDebug: RAGDebug = {
      hasOrgKnowledge: false,
      activeDomain: domain,
      domainMatch: true,
      ragMode: "public_only",
      reason: `Using public knowledge only. Organization-specific knowledge is temporarily unavailable (${errorMessage}).`,
      chunkCount: 0,
      allowedDomains: allowedDomainPatterns.length > 0 ? allowedDomainPatterns : undefined,
    }
    return {
      chunks: [],
      citations: [],
      hasOrgKnowledge: false,
      ragDebug,
    }
  }
}

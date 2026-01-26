/**
 * Resolve API client — proxy to browser automation / knowledge extraction service.
 *
 * Calls GET /api/knowledge/resolve on the extraction service.
 * Schema for that endpoint is defined in docs/BROWSER_AUTOMATION_RESOLVE_SCHEMA.md.
 */

function getExtractionServiceBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_KNOWLEDGE_EXTRACTION_API_URL ||
    process.env.KNOWLEDGE_EXTRACTION_API_URL ||
    "http://localhost:8000"
  )
}

/** Chunk returned by extraction service resolve API. */
export interface ResolveKnowledgeChunk {
  id: string
  content: string
  documentTitle: string
  /** Optional metadata (e.g. section, page, source URL). */
  metadata?: Record<string, unknown>
}

/** Citation returned by extraction service resolve API. */
export interface ResolveCitation {
  documentId: string
  documentTitle: string
  section?: string
  page?: number
}

/** Extraction service resolve API response (before we add allowed, domain, hasOrgKnowledge). */
export interface ExtractionServiceResolveResponse {
  context: ResolveKnowledgeChunk[]
  citations?: ResolveCitation[]
}

/**
 * Call the extraction service resolve endpoint.
 *
 * @param url - Active tab URL (required)
 * @param query - Optional query for relevance filtering
 * @param tenantId - Tenant ID (userId or organizationId) for isolation
 * @returns { context, citations } — empty arrays if none
 * @throws On non-2xx response (network or extraction service error)
 */
export async function fetchResolveFromExtractionService(
  url: string,
  query: string | undefined,
  tenantId: string
): Promise<ExtractionServiceResolveResponse> {
  const baseUrl = getExtractionServiceBaseUrl()
  const params = new URLSearchParams()
  params.set("url", url)
  if (query) params.set("query", query)
  const apiUrl = `${baseUrl}/api/knowledge/resolve?${params.toString()}`

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": tenantId,
    },
  })

  if (!response.ok) {
    let detail = "Failed to resolve knowledge"
    try {
      const body = (await response.json()) as { error?: string; detail?: string }
      detail = body.error ?? body.detail ?? detail
    } catch {
      detail = response.statusText || detail
    }
    const err = new Error(detail) as Error & { statusCode?: number }
    err.statusCode = response.status
    throw err
  }

  const data = (await response.json()) as ExtractionServiceResolveResponse
  return {
    context: Array.isArray(data.context) ? data.context : [],
    citations: Array.isArray(data.citations) ? data.citations : [],
  }
}

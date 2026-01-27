import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getRAGChunks } from "@/lib/knowledge-extraction/rag-helper"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"
import { createDebugLog, extractHeaders } from "@/lib/utils/debug-logger"
import { applyRateLimit } from "@/lib/middleware/rate-limit"

/**
 * GET /api/knowledge/resolve
 *
 * Thin Client knowledge resolution — **internal use and debugging only** (§1.5 THIN_CLIENT_ROADMAP_SERVER).
 * Not for extension overlay or end-user display.
 *
 * - Query params: `url` (required), `query` (optional).
 * - Auth: Bearer. Resolve userId, tenantId via getSessionFromToken.
 * - allowed_domains as **filter** (§1.6): if domain matches → hasOrgKnowledge true, proxy to extraction service;
 *   else → hasOrgKnowledge false, public-only (no extraction call). Never 403.
 * - Response: ResolveKnowledgeResponse { allowed: true, domain, hasOrgKnowledge, context, citations? }.
 *
 * Schema: THIN_CLIENT_ROADMAP_SERVER §3.2; extraction service → BROWSER_AUTOMATION_RESOLVE_SCHEMA.md.
 */

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight ?? new NextResponse(null, { status: 204 })
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  let urlParam: string | null = null
  let queryParam: string | undefined = undefined

  try {
    // Apply rate limiting
    const rateLimitResponse = await applyRateLimit(req, "/api/knowledge/resolve")
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      })
      const duration = Date.now() - startTime
      await createDebugLog({
        tenantId: "unknown",
        logType: "error",
        endpoint: "/api/knowledge/resolve",
        method: "GET",
        headers: extractHeaders(req),
        statusCode: 401,
        duration,
        error: {
          type: "UNAUTHORIZED",
          message: "Missing or invalid Authorization header",
        },
      })
      return addCorsHeaders(req, err)
    }

    const { tenantId } = session
    const searchParams = req.nextUrl.searchParams
    urlParam = searchParams.get("url")
    queryParam = searchParams.get("query") ?? undefined

    if (!urlParam || typeof urlParam !== "string" || !urlParam.trim()) {
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Missing required query parameter: url",
      })
      const duration = Date.now() - startTime
      await createDebugLog({
        tenantId,
        logType: "error",
        endpoint: "/api/knowledge/resolve",
        method: "GET",
        requestData: {
          url: urlParam,
          query: queryParam,
        },
        headers: extractHeaders(req),
        statusCode: 400,
        duration,
        error: {
          type: "VALIDATION_ERROR",
          message: "Missing required query parameter: url",
        },
      })
      return addCorsHeaders(req, err)
    }

    // Normalize URL: add https:// if no protocol is present
    // This allows domain-only URLs like "demo.openemr.io" since knowledge is domain-based
    let normalizedUrl = urlParam.trim()
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = `https://${normalizedUrl}`
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(normalizedUrl)
    } catch {
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid url: must be a valid URL or domain",
      })
      return addCorsHeaders(req, err)
    }

    const domain = parsedUrl.hostname
    const url = parsedUrl.toString()
    const query = typeof queryParam === "string" && queryParam.trim() ? queryParam.trim() : undefined

    // Reuse shared RAG helper (same logic as Task 3)
    const { chunks, citations, hasOrgKnowledge, ragDebug } = await getRAGChunks(url, query, tenantId)

    const body = {
      allowed: true as const,
      domain,
      hasOrgKnowledge,
      context: chunks,
      citations: citations || [],
      ragDebug,
    }
    const duration = Date.now() - startTime
    const res = NextResponse.json(body, { status: 200 })

    // Log successful response
    await createDebugLog({
      tenantId,
      logType: "api_response",
      endpoint: "/api/knowledge/resolve",
      method: "GET",
      requestData: {
        url: urlParam,
        query: queryParam,
      },
      responseData: {
        allowed: body.allowed,
        domain: body.domain,
        hasOrgKnowledge: body.hasOrgKnowledge,
        context: Array.isArray(chunks) && chunks.length > 10 ? chunks.slice(0, 10) : chunks,
        context_truncated: Array.isArray(chunks) && chunks.length > 10,
        context_total_count: Array.isArray(chunks) ? chunks.length : 0,
        citations: citations || [],
      },
      headers: extractHeaders(req),
      statusCode: 200,
      duration,
      metadata: {
        hasOrgKnowledge,
        chunkCount: Array.isArray(chunks) ? chunks.length : 0,
        citationCount: citations ? citations.length : 0,
      },
    })

    return addCorsHeaders(req, res)
  } catch (e: unknown) {
    Sentry.captureException(e)
    const duration = Date.now() - startTime
    const errorMessage = e instanceof Error ? e.message : "An unexpected error occurred"
    const errorStack = e instanceof Error ? e.stack : undefined

    // Log error
    await createDebugLog({
      tenantId: "unknown",
      logType: "error",
      endpoint: "/api/knowledge/resolve",
      method: "GET",
      requestData: {
        url: urlParam,
        query: queryParam,
      },
      headers: extractHeaders(req),
      statusCode: 500,
      duration,
      error: {
        type: "INTERNAL_ERROR",
        message: errorMessage,
        stack: errorStack,
      },
    })

    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    })
    return addCorsHeaders(req, err)
  }
}

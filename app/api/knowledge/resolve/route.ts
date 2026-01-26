import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getRAGChunks } from "@/lib/knowledge-extraction/rag-helper"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"

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
  try {
    const session = await getSessionFromRequest(req.headers)
    if (!session) {
      const err = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing or invalid Authorization header",
      })
      return addCorsHeaders(req, err)
    }

    const { tenantId } = session
    const searchParams = req.nextUrl.searchParams
    const urlParam = searchParams.get("url")
    const queryParam = searchParams.get("query") ?? undefined

    if (!urlParam || typeof urlParam !== "string" || !urlParam.trim()) {
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Missing required query parameter: url",
      })
      return addCorsHeaders(req, err)
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(urlParam.trim())
    } catch {
      const err = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        message: "Invalid url: must be a valid absolute URL",
      })
      return addCorsHeaders(req, err)
    }

    const domain = parsedUrl.hostname
    const url = parsedUrl.toString()
    const query = typeof queryParam === "string" && queryParam.trim() ? queryParam.trim() : undefined

    // Reuse shared RAG helper (same logic as Task 3)
    const { chunks, citations, hasOrgKnowledge } = await getRAGChunks(url, query, tenantId)

    const body = {
      allowed: true as const,
      domain,
      hasOrgKnowledge,
      context: chunks,
      citations: citations || [],
    }
    const res = NextResponse.json(body, { status: 200 })
    return addCorsHeaders(req, res)
  } catch (e: unknown) {
    Sentry.captureException(e)
    const err = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    })
    return addCorsHeaders(req, err)
  }
}

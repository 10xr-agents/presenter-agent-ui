import { NextRequest, NextResponse } from "next/server"

/**
 * CORS helper for Chrome extension origin
 * 
 * Allows requests from chrome-extension:// origins for Thin Client APIs.
 * Used by /api/v1/*, /api/agent/*, /api/knowledge/* routes.
 */
export function getCorsHeaders(origin: string | null): Headers {
  const headers = new Headers()

  // Check if origin is a Chrome extension
  const isExtensionOrigin = origin?.startsWith("chrome-extension://")

  if (isExtensionOrigin && origin) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
    headers.set("Access-Control-Allow-Credentials", "false") // Bearer tokens, no cookies
    headers.set("Access-Control-Max-Age", "86400") // 24 hours
  }

  return headers
}

/**
 * Handle CORS preflight (OPTIONS) requests
 */
export function handleCorsPreflight(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("Origin")

  if (!origin?.startsWith("chrome-extension://")) {
    return null // Not an extension request, let Next.js handle it
  }

  const headers = getCorsHeaders(origin)

  return new NextResponse(null, {
    status: 204,
    headers,
  })
}

/**
 * Add CORS headers to response for extension origin
 */
export function addCorsHeaders(
  req: NextRequest,
  response: NextResponse
): NextResponse {
  const origin = req.headers.get("Origin")
  const corsHeaders = getCorsHeaders(origin)

  // Merge CORS headers into response
  corsHeaders.forEach((value, key) => {
    response.headers.set(key, value)
  })

  return response
}

import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getSessionFromRequest } from "@/lib/auth/session"
import { errorResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"

/**
 * POST /api/v1/auth/logout
 * 
 * Thin Client auth adapter: invalidates Bearer token via Better Auth.
 * 
 * Contract: 204 No Content
 */
export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight || new NextResponse(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  try {
    // Validate Bearer token and get session
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      const errorResp = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Missing Authorization header",
      })
      return addCorsHeaders(req, errorResp)
    }

    // Create headers with Authorization for Better Auth
    const requestHeaders = new Headers()
    requestHeaders.set("Authorization", authHeader)

    // Verify session exists before signing out
    const session = await auth.api.getSession({ headers: requestHeaders })
    if (!session) {
      const errorResp = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      })
      return addCorsHeaders(req, errorResp)
    }

    // Invalidate session via Better Auth signOut
    // Pass the Authorization header so Better Auth knows which session to invalidate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any

    await authApi.signOut({
      headers: requestHeaders,
    })

    // Return 204 No Content per contract with CORS headers
    const response = new NextResponse(null, { status: 204 })
    return addCorsHeaders(req, response)
  } catch (error: unknown) {
    Sentry.captureException(error)
    const errorMessage = error instanceof Error ? error.message : "Internal server error"
    const errorResp = errorResponse("INTERNAL_ERROR", 500, {
      code: "INTERNAL_ERROR",
      message: errorMessage,
    })
    return addCorsHeaders(req, errorResp)
  }
}

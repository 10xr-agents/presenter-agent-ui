import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getSessionFromRequest } from "@/lib/auth/session"
import { getTenantState, getActiveOrganizationId } from "@/lib/utils/tenant-state"
import { errorResponse } from "@/lib/utils/api-response"
import { handleCorsPreflight, addCorsHeaders } from "@/lib/utils/cors"
import * as Sentry from "@sentry/nextjs"

/**
 * GET /api/v1/auth/session
 * 
 * Thin Client auth adapter: validates Bearer token and returns
 * user and tenant info (no token in response).
 * 
 * Contract: { user: { id, email, name }, tenantId, tenantName }
 */
export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight || new NextResponse(null, { status: 204 })
}

export async function GET(req: NextRequest) {
  try {
    // Get session from Bearer token (getSessionFromRequest already calls auth.api.getSession)
    // We need the full session for user details, so call getSession directly
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
    const session = await auth.api.getSession({ headers: requestHeaders })

    if (!session || !session.user) {
      const errorResp = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      })
      return addCorsHeaders(req, errorResp)
    }

    const userId = session.user.id

    if (!session || !session.user) {
      const errorResp = errorResponse("UNAUTHORIZED", 401, {
        code: "UNAUTHORIZED",
        message: "Session not found",
      })
      return addCorsHeaders(req, errorResp)
    }

    // Resolve tenant (user or organization)
    const tenantState = await getTenantState(userId)
    let tenantId: string
    let tenantName: string

    if (tenantState === "organization") {
      const organizationId = await getActiveOrganizationId()
      tenantId = organizationId || userId

      // Get organization name if available
      if (organizationId) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const authApi = auth.api as any
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const orgResult = await authApi.organization?.getActive({
            headers: await headers(),
          })
          tenantName = orgResult?.data?.name || session.user.name || "Organization"
        } catch {
          tenantName = session.user.name || "Organization"
        }
      } else {
        tenantName = session.user.name || "User"
      }
    } else {
      tenantId = userId
      tenantName = session.user.name || "User"
    }

    // Return contract response (no token) with CORS headers
    const response = NextResponse.json(
      {
        user: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name || "",
        },
        tenantId,
        tenantName,
      },
      { status: 200 }
    )

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

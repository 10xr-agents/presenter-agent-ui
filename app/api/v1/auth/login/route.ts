import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { errorResponse } from "@/lib/utils/api-response"
import { addCorsHeaders, handleCorsPreflight } from "@/lib/utils/cors"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

/**
 * POST /api/v1/auth/login
 * 
 * Thin Client auth adapter: wraps Better Auth sign-in and returns
 * accessToken in response body (for extension storage in chrome.storage.local).
 * 
 * Contract: { accessToken, expiresAt, user: { id, email, name }, tenantId, tenantName }
 */
const loginRequestBodySchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
})

export async function OPTIONS(req: NextRequest) {
  const preflight = handleCorsPreflight(req)
  return preflight || new NextResponse(null, { status: 204 })
}

export async function POST(req: NextRequest) {
  try {
    // Parse and validate body
    const body = (await req.json()) as unknown
    const validationResult = loginRequestBodySchema.safeParse(body)

    if (!validationResult.success) {
      const errorResp = errorResponse("VALIDATION_ERROR", 400, {
        code: "VALIDATION_ERROR",
        errors: validationResult.error.issues,
      })
      return addCorsHeaders(req, errorResp)
    }

    const { email, password } = validationResult.data

    // Call Better Auth signInEmail API with returnHeaders to get set-auth-token header
    // (Bearer plugin sets this header on sign-in response)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authApi = auth.api as any

    try {
      const signInResult = await authApi.signInEmail({
        body: {
          email,
          password,
        },
        headers: await headers(),
        returnHeaders: true, // Get headers to extract set-auth-token
      })

      // Check for errors
      if (signInResult.error) {
        const errorCode = signInResult.error.code || "INVALID_CREDENTIALS"
        const statusCode = errorCode === "INVALID_CREDENTIALS" ? 401 : 400

        const errorResp = errorResponse(signInResult.error.message || "Authentication failed", statusCode, {
          code: errorCode,
        })
        return addCorsHeaders(req, errorResp)
      }

      // Extract Bearer token from set-auth-token header
      const responseHeaders = signInResult.headers as Headers
      const authToken = responseHeaders.get("set-auth-token")

      if (!authToken) {
        Sentry.captureException(new Error("Better Auth sign-in succeeded but no set-auth-token header"))
        const errorResp = errorResponse("INTERNAL_ERROR", 500, {
          code: "INTERNAL_ERROR",
          message: "Authentication succeeded but token not issued",
        })
        return addCorsHeaders(req, errorResp)
      }

      // Get session to retrieve user info using the Bearer token
      const sessionHeaders = new Headers()
      sessionHeaders.set("Authorization", `Bearer ${authToken}`)
      const session = await auth.api.getSession({ headers: sessionHeaders })

      if (!session || !session.user) {
        const errorResp = errorResponse("INTERNAL_ERROR", 500, {
          code: "INTERNAL_ERROR",
          message: "Session not found after sign-in",
        })
        return addCorsHeaders(req, errorResp)
      }

      const userId = session.user.id

      // Resolve tenant (user or organization)
      // Use sessionHeaders (with Bearer token) instead of request headers
      // This ensures the organization API calls are authenticated
      const tenantState = await getTenantOperatingMode(userId, sessionHeaders)
      let tenantId: string
      let tenantName: string

      if (tenantState === "organization") {
        const organizationId = await getActiveOrganizationId(sessionHeaders)
        tenantId = organizationId || userId

        // Get organization name if available
        if (organizationId) {
          try {
             
            const orgResult = await authApi.organization?.getActive({
              headers: sessionHeaders,
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

      // Get session expiry from Better Auth session
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessionData = session.session as any
      const expiresAt = sessionData?.expiresAt
        ? new Date(sessionData.expiresAt).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Default 7 days

      // Return contract response with CORS headers
      const response = NextResponse.json(
        {
          accessToken: authToken,
          expiresAt,
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
      // Handle APIError from Better Auth
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any)?.status && (error as any)?.message) {
        const statusCode = (error as any).status === 401 ? 401 : 400
        const errorResp = errorResponse((error as any).message || "Authentication failed", statusCode, {
          code: (error as any).code || "AUTH_ERROR",
        })
        return addCorsHeaders(req, errorResp)
      }
      // Re-throw to be caught by outer catch
      throw error
    }
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

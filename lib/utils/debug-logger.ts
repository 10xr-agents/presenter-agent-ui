import { NextRequest } from "next/server"
import { connectDB } from "@/lib/db/mongoose"
import { DebugLog } from "@/lib/models/debug-log"

/**
 * Mask sensitive data in headers
 */
function maskHeaders(headers: Headers): Record<string, string> {
  const masked: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "authorization") {
      masked[key] = value ? "Bearer ***" : ""
    } else {
      masked[key] = value
    }
  })
  return masked
}

/**
 * Mask sensitive data in request body
 */
function maskRequestData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") {
    return {}
  }

  const masked: Record<string, unknown> = {}
  const obj = data as Record<string, unknown>

  for (const [key, value] of Object.entries(obj)) {
    // Mask sensitive fields
    if (key.toLowerCase().includes("password") || key.toLowerCase().includes("token") || key.toLowerCase().includes("secret")) {
      masked[key] = "***"
    } else if (key === "dom" && typeof value === "string" && value.length > 50000) {
      // Truncate large DOM strings
      masked[key] = value.substring(0, 50000) + `... [truncated, original length: ${value.length}]`
    } else {
      masked[key] = value
    }
  }

  return masked
}

/**
 * Truncate large response data
 */
function truncateResponseData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") {
    return {}
  }

  const truncated: Record<string, unknown> = {}
  const obj = data as Record<string, unknown>

  for (const [key, value] of Object.entries(obj)) {
    if (key === "context" && Array.isArray(value) && value.length > 10) {
      // Truncate large context arrays
      truncated[key] = value.slice(0, 10)
      truncated[`${key}_truncated`] = true
      truncated[`${key}_total_count`] = value.length
    } else if (key === "dom" && typeof value === "string" && value.length > 50000) {
      // Truncate large DOM strings
      truncated[key] = value.substring(0, 50000) + `... [truncated, original length: ${value.length}]`
    } else {
      truncated[key] = value
    }
  }

  return truncated
}

/**
 * Create a debug log entry
 */
export async function createDebugLog(params: {
  tenantId: string
  taskId?: string
  logType: "api_request" | "api_response" | "execution_metric" | "error"
  endpoint: string
  method: string
  requestData?: unknown
  responseData?: unknown
  headers?: Headers
  statusCode: number
  duration: number
  error?: {
    type?: string
    message?: string
    stack?: string
  }
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await connectDB()

    const maskedHeaders = params.headers ? maskHeaders(params.headers) : undefined
    const maskedRequestData = params.requestData ? maskRequestData(params.requestData) : undefined
    const truncatedResponseData = params.responseData ? truncateResponseData(params.responseData) : undefined

    await (DebugLog as any).create({
      tenantId: params.tenantId,
      taskId: params.taskId,
      logType: params.logType,
      endpoint: params.endpoint,
      method: params.method,
      requestData: maskedRequestData,
      responseData: truncatedResponseData,
      headers: maskedHeaders,
      statusCode: params.statusCode,
      duration: params.duration,
      timestamp: new Date(),
      error: params.error,
      metadata: params.metadata,
    })
  } catch (error: unknown) {
    // Log error but don't throw - debug logging should not break the main flow
    console.error("[debug-logger] Failed to create debug log:", error)
  }
}

/**
 * Extract headers from NextRequest
 */
export function extractHeaders(req: NextRequest): Headers {
  const headers = new Headers()
  req.headers.forEach((value, key) => {
    headers.set(key, value)
  })
  return headers
}

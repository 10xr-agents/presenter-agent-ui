import { NextResponse } from "next/server"
import { ErrorCode, type StandardErrorResponse } from "./error-codes"
import type { ErrorDebugInfo } from "./error-debug"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: ErrorCode | string // Standardized error code
  message?: string
  details?: {
    field?: string
    reason?: string
    [key: string]: unknown
  }
  debugInfo?: ErrorDebugInfo // Task 4: Error debug info (only in debug mode)
  retryAfter?: number // For rate limit errors
}

export function successResponse<T>(
  data: T,
  message?: string,
  status: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(message && { message }),
    },
    { status }
  )
}

export function errorResponse(
  error: string | Error | ErrorCode,
  status: number = 400,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any,
  debugInfo?: ErrorDebugInfo, // Task 4: Optional debug info
  retryAfter?: number // For rate limit errors
): NextResponse<ApiResponse> {
  // Handle ErrorCode enum
  if (typeof error === "string" && Object.values(ErrorCode).includes(error as ErrorCode)) {
    const errorCode = error as ErrorCode
    const errorMessage = details?.message || getDefaultErrorMessage(errorCode)
    
    return NextResponse.json(
      {
        success: false,
        code: errorCode,
        message: errorMessage,
        error: errorMessage, // Keep for backward compatibility
        ...(details && { details }),
        ...(debugInfo && { debugInfo }),
        ...(retryAfter !== undefined && { retryAfter }),
      } as ApiResponse,
      { status }
    )
  }

  // Handle Error object or string
  const errorMessage = error instanceof Error ? error.message : error
  const errorCode = details?.code || ErrorCode.INTERNAL_ERROR

  return NextResponse.json(
    {
      success: false,
      code: errorCode,
      message: errorMessage,
      error: errorMessage, // Keep for backward compatibility
      ...(details && { details }),
      ...(debugInfo && { debugInfo }), // Only included if provided (debug mode check done in buildErrorDebugInfo)
      ...(retryAfter !== undefined && { retryAfter }),
    } as ApiResponse,
    { status }
  )
}

/**
 * Get default error message for error code
 */
function getDefaultErrorMessage(code: ErrorCode): string {
  const messages: Record<ErrorCode, string> = {
    [ErrorCode.UNAUTHORIZED]: "Unauthorized",
    [ErrorCode.FORBIDDEN]: "Forbidden",
    [ErrorCode.VALIDATION_ERROR]: "Validation error",
    [ErrorCode.INVALID_ACTION_FORMAT]: "Invalid action format",
    [ErrorCode.INVALID_REQUEST]: "Invalid request",
    [ErrorCode.RATE_LIMIT]: "Rate limit exceeded. Please try again later.",
    [ErrorCode.QUOTA_EXCEEDED]: "Quota exceeded",
    [ErrorCode.NOT_FOUND]: "Resource not found",
    [ErrorCode.SESSION_NOT_FOUND]: "Session not found",
    [ErrorCode.TASK_NOT_FOUND]: "Task not found",
    [ErrorCode.TASK_COMPLETED]: "Task already completed",
    [ErrorCode.RESOURCE_CONFLICT]: "Resource conflict",
    [ErrorCode.INTERNAL_ERROR]: "Internal server error",
    [ErrorCode.LLM_ERROR]: "LLM service error",
    [ErrorCode.DATABASE_ERROR]: "Database error",
    [ErrorCode.EXTERNAL_SERVICE_ERROR]: "External service error",
    [ErrorCode.PARSE_ERROR]: "Parse error",
    [ErrorCode.MAX_STEPS_EXCEEDED]: "Maximum steps exceeded",
    [ErrorCode.TIMEOUT]: "Request timeout",
  }
  return messages[code] || "An error occurred"
}

export function unauthorizedResponse(
  message: string = "Unauthorized"
): NextResponse<ApiResponse> {
  return errorResponse(message, 401)
}

export function forbiddenResponse(
  message: string = "Forbidden"
): NextResponse<ApiResponse> {
  return errorResponse(message, 403)
}

export function notFoundResponse(
  message: string = "Not found"
): NextResponse<ApiResponse> {
  return errorResponse(message, 404)
}

export function serverErrorResponse(
  error: string | Error = "Internal server error",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any
): NextResponse<ApiResponse> {
  return errorResponse(error, 500, details)
}


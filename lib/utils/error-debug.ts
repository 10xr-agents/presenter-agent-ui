/**
 * Error Debug Info Utility (Task 4)
 *
 * Provides detailed error information for debug UI, including error classification,
 * context, stack traces (in debug mode only), and recovery suggestions.
 */

export type ErrorType =
  | "VALIDATION_ERROR"
  | "LLM_ERROR"
  | "RAG_ERROR"
  | "EXECUTION_ERROR"
  | "AUTH_ERROR"
  | "RATE_LIMIT_ERROR"
  | "INTERNAL_ERROR"

export interface ErrorDebugInfo {
  errorType: ErrorType
  errorMessage: string
  stackTrace?: string // Only included in debug mode
  context?: Record<string, unknown> // Error context (request data, task state, etc.)
  suggestions?: string[] // Recovery suggestions
}

/**
 * Check if debug mode is enabled
 * Debug mode is enabled when NODE_ENV is 'development' or DEBUG_MODE env var is set
 */
export function isDebugMode(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.DEBUG_MODE === "true" ||
    process.env.DEBUG_MODE === "1"
  )
}

/**
 * Classify error type from error object and context
 */
export function classifyErrorType(
  error: unknown,
  context?: { code?: string; statusCode?: number; endpoint?: string }
): ErrorType {
  // Check context code first (most specific)
  if (context?.code) {
    const code = context.code.toUpperCase()
    if (code === "VALIDATION_ERROR" || code === "MAX_STEPS_EXCEEDED") {
      return "VALIDATION_ERROR"
    }
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
      return "AUTH_ERROR"
    }
    if (code === "TASK_NOT_FOUND") {
      return "VALIDATION_ERROR"
    }
    if (code === "PARSE_ERROR") {
      return "EXECUTION_ERROR"
    }
    if (code === "RATE_LIMIT") {
      return "RATE_LIMIT_ERROR"
    }
  }

  // Check error message patterns
  const errorMessage =
    error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  if (
    lowerMessage.includes("llm") ||
    lowerMessage.includes("openai") ||
    lowerMessage.includes("anthropic") ||
    lowerMessage.includes("model") ||
    lowerMessage.includes("completion")
  ) {
    return "LLM_ERROR"
  }

  if (
    lowerMessage.includes("rag") ||
    lowerMessage.includes("extraction") ||
    lowerMessage.includes("knowledge") ||
    lowerMessage.includes("resolve")
  ) {
    return "RAG_ERROR"
  }

  if (
    lowerMessage.includes("validation") ||
    lowerMessage.includes("invalid") ||
    lowerMessage.includes("required") ||
    lowerMessage.includes("format")
  ) {
    return "VALIDATION_ERROR"
  }

  if (
    lowerMessage.includes("auth") ||
    lowerMessage.includes("unauthorized") ||
    lowerMessage.includes("forbidden") ||
    lowerMessage.includes("token")
  ) {
    return "AUTH_ERROR"
  }

  if (
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("too many requests") ||
    lowerMessage.includes("quota")
  ) {
    return "RATE_LIMIT_ERROR"
  }

  // Default to INTERNAL_ERROR
  return "INTERNAL_ERROR"
}

/**
 * Generate recovery suggestions based on error type
 */
export function getRecoverySuggestions(
  errorType: ErrorType,
  context?: Record<string, unknown>
): string[] {
  const suggestions: string[] = []

  switch (errorType) {
    case "VALIDATION_ERROR":
      suggestions.push("Check request format and required fields")
      suggestions.push("Verify URL format and taskId (if provided) are valid")
      if (context?.validationErrors) {
        suggestions.push("Review validation errors in context for specific field issues")
      }
      break

    case "LLM_ERROR":
      suggestions.push("Check LLM API key configuration")
      suggestions.push("Verify LLM service availability and rate limits")
      suggestions.push("Retry the request after a short delay")
      break

    case "RAG_ERROR":
      suggestions.push("Verify extraction service is running and accessible")
      suggestions.push("Check domain matches allowed_domains configuration")
      suggestions.push("System will fall back to public knowledge if extraction fails")
      break

    case "EXECUTION_ERROR":
      suggestions.push("Check action format matches expected structure")
      suggestions.push("Verify DOM structure is valid and parseable")
      suggestions.push("Review task history for previous successful actions")
      break

    case "AUTH_ERROR":
      suggestions.push("Verify Authorization header is present and valid")
      suggestions.push("Check token expiration and refresh if needed")
      suggestions.push("Ensure user has access to the requested tenant/organization")
      break

    case "RATE_LIMIT_ERROR":
      suggestions.push("Wait before retrying the request")
      suggestions.push("Check rate limit configuration and quotas")
      suggestions.push("Consider implementing request throttling")
      break

    case "INTERNAL_ERROR":
      suggestions.push("Retry the request after a short delay")
      suggestions.push("Check server logs for detailed error information")
      suggestions.push("Contact support if the issue persists")
      break
  }

  return suggestions
}

/**
 * Build error debug info from error and context
 */
export function buildErrorDebugInfo(
  error: unknown,
  context?: {
    code?: string
    statusCode?: number
    endpoint?: string
    requestData?: unknown
    taskId?: string
    taskState?: Record<string, unknown>
    [key: string]: unknown
  }
): ErrorDebugInfo | undefined {
  // Only include debug info in debug mode
  if (!isDebugMode()) {
    return undefined
  }

  const errorType = classifyErrorType(error, context)
  const errorMessage =
    error instanceof Error ? error.message : String(error)
  const stackTrace = error instanceof Error ? error.stack : undefined

  // Build context object (exclude sensitive data)
  const errorContext: Record<string, unknown> = {}
  if (context?.code) {
    errorContext.code = context.code
  }
  if (context?.statusCode) {
    errorContext.statusCode = context.statusCode
  }
  if (context?.endpoint) {
    errorContext.endpoint = context.endpoint
  }
  if (context?.taskId) {
    errorContext.taskId = context.taskId
  }
  if (context?.taskState) {
    errorContext.taskState = context.taskState
  }
  // Include request data if available (will be masked by debug logger)
  if (context?.requestData) {
    errorContext.requestData = context.requestData
  }

  const suggestions = getRecoverySuggestions(errorType, context)

  return {
    errorType,
    errorMessage,
    stackTrace, // Only in debug mode
    context: Object.keys(errorContext).length > 0 ? errorContext : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  }
}

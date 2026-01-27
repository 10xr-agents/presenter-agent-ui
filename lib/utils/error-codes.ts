/**
 * Standardized Error Codes Enum
 * 
 * All API endpoints should use these error codes for consistent error handling.
 * Error codes are uppercase strings for easy identification in logs and monitoring.
 */
export enum ErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  
  // Validation
  VALIDATION_ERROR = "VALIDATION_ERROR",
  INVALID_ACTION_FORMAT = "INVALID_ACTION_FORMAT",
  INVALID_REQUEST = "INVALID_REQUEST",
  
  // Rate Limiting
  RATE_LIMIT = "RATE_LIMIT",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  
  // Resources
  NOT_FOUND = "NOT_FOUND",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  TASK_COMPLETED = "TASK_COMPLETED",
  RESOURCE_CONFLICT = "RESOURCE_CONFLICT",
  
  // Server Errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  LLM_ERROR = "LLM_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  
  // Execution Errors
  PARSE_ERROR = "PARSE_ERROR",
  MAX_STEPS_EXCEEDED = "MAX_STEPS_EXCEEDED",
  TIMEOUT = "TIMEOUT",
}

/**
 * Standardized Error Response Interface
 * 
 * All error responses should follow this format for consistency.
 */
export interface StandardErrorResponse {
  success: false
  code: ErrorCode | string // Error code from enum
  message: string // Human-readable error message
  details?: {
    field?: string // For validation errors
    reason?: string // Additional context
    [key: string]: unknown
  }
  debugInfo?: {
    // Only included when debug mode enabled
    errorType: string
    stack?: string
    context?: Record<string, unknown>
  }
  retryAfter?: number // For rate limit errors (seconds)
}

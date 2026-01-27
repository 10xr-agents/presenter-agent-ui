type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal"

interface LogContext {
  userId?: string
  tenantId?: string
  organizationId?: string
  requestId?: string
  endpoint?: string
  method?: string
  statusCode?: number
  duration?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

interface StructuredLog {
  timestamp: string
  level: LogLevel
  message: string
  userId?: string
  tenantId?: string
  requestId?: string
  endpoint?: string
  method?: string
  statusCode?: number
  duration?: number
  metadata?: Record<string, unknown>
  error?: {
    message?: string
    stack?: string
    name?: string
    [key: string]: unknown
  }
}

class Logger {
  /**
   * Format log as JSON for production (structured logging)
   * Format as human-readable string for development
   */
  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error | unknown): string | StructuredLog {
    const timestamp = new Date().toISOString()
    
    const structuredLog: StructuredLog = {
      timestamp,
      level,
      message,
      ...(context?.userId && { userId: context.userId }),
      ...(context?.tenantId && { tenantId: context.tenantId }),
      ...(context?.organizationId && { organizationId: context.organizationId }),
      ...(context?.requestId && { requestId: context.requestId }),
      ...(context?.endpoint && { endpoint: context.endpoint }),
      ...(context?.method && { method: context.method }),
      ...(context?.statusCode && { statusCode: context.statusCode }),
      ...(context?.duration && { duration: context.duration }),
    }

    // Add error details if present
    if (error) {
      structuredLog.error = error instanceof Error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : { message: String(error) }
    }

    // Add remaining context as metadata
    if (context) {
      const { userId, tenantId, organizationId, requestId, endpoint, method, statusCode, duration, ...metadata } = context
      if (Object.keys(metadata).length > 0) {
        structuredLog.metadata = metadata
      }
    }

    // In production, return JSON string for log aggregation
    if (process.env.NODE_ENV === "production") {
      return JSON.stringify(structuredLog)
    }

    // In development, return human-readable format
    const contextStr = context ? ` ${JSON.stringify(context)}` : ""
    const errorStr = error ? ` Error: ${error instanceof Error ? error.message : String(error)}` : ""
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}${errorStr}`
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error | unknown): void {
    const formatted = this.formatLog(level, message, context, error)

    switch (level) {
      case "trace":
      case "debug":
        if (process.env.NODE_ENV === "development") {
          console.debug(formatted)
        }
        break
      case "info":
        console.info(formatted)
        break
      case "warn":
        console.warn(formatted)
        break
      case "error":
      case "fatal":
        console.error(formatted)
        break
    }
  }

  trace(message: string, context?: LogContext): void {
    this.log("trace", message, context)
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context)
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context)
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    this.log("error", message, context, error)
  }

  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    this.log("fatal", message, context, error)
  }
}

export const logger = new Logger()


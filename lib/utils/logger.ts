type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal"

/**
 * Trace context for request/task-scoped logging.
 * Use process + sessionId + taskId so logs can be filtered by request or task.
 */
export interface TraceContext {
  /** Process or module name, e.g. "RouteIntegration", "Graph:verification" */
  process?: string
  /** Session/chat ID when applicable */
  sessionId?: string
  /** Task/message ID when applicable */
  taskId?: string
  /** Message ID when applicable (alternative to taskId for chat flows) */
  messageId?: string
}

export interface LogContext extends TraceContext {
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
  process?: string
  sessionId?: string
  taskId?: string
  messageId?: string
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
  /** Build trace prefix for dev: [process][sess:id][task:id] for grep-friendly filtering */
  private tracePrefix(context?: LogContext): string {
    if (!context || (context.process == null && context.sessionId == null && context.taskId == null && context.messageId == null))
      return ""
    const process = context.process ?? "-"
    const sess = context.sessionId ?? "-"
    const task = context.taskId ?? context.messageId ?? "-"
    return `[${process}][sess:${sess}][task:${task}] `
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error | unknown): string | StructuredLog {
    const timestamp = new Date().toISOString()

    const structuredLog: StructuredLog = {
      timestamp,
      level,
      message,
      ...(context?.process && { process: context.process }),
      ...(context?.sessionId && { sessionId: context.sessionId }),
      ...(context?.taskId && { taskId: context.taskId }),
      ...(context?.messageId && { messageId: context.messageId }),
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
      const {
        process: _p,
        sessionId: _s,
        taskId: _t,
        messageId: _m,
        userId,
        tenantId,
        organizationId,
        requestId,
        endpoint,
        method,
        statusCode,
        duration,
        ...metadata
      } = context
      if (Object.keys(metadata).length > 0) {
        structuredLog.metadata = metadata
      }
    }

    // In production, return JSON string for log aggregation
    if (process.env.NODE_ENV === "production") {
      return JSON.stringify(structuredLog)
    }

    // In development: [timestamp] [LEVEL] [process][sess:id][task:id] message ... (grep-friendly)
    const prefix = this.tracePrefix(context)
    const extra =
      context &&
      Object.keys(context).some(
        (k) => !["process", "sessionId", "taskId", "messageId"].includes(k) && (context as Record<string, unknown>)[k] != null
      )
        ? ` ${JSON.stringify(context)}`
        : ""
    const errorStr = error ? ` Error: ${error instanceof Error ? error.message : String(error)}` : ""
    return `[${timestamp}] [${level.toUpperCase()}] ${prefix}${message}${extra}${errorStr}`
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

  /**
   * Create a scoped logger that automatically includes the given trace context
   * (process, sessionId, taskId, messageId) in every log. Use for request/task-scoped flows
   * so logs can be filtered by session or task.
   */
  child(context: TraceContext & Partial<LogContext>): ScopedLogger {
    const merged = { ...context }
    return {
      trace: (msg: string, ctx?: LogContext) => this.trace(msg, { ...merged, ...ctx }),
      debug: (msg: string, ctx?: LogContext) => this.debug(msg, { ...merged, ...ctx }),
      info: (msg: string, ctx?: LogContext) => this.info(msg, { ...merged, ...ctx }),
      warn: (msg: string, ctx?: LogContext) => this.warn(msg, { ...merged, ...ctx }),
      error: (msg: string, err?: Error | unknown, ctx?: LogContext) => this.error(msg, err, { ...merged, ...ctx }),
      fatal: (msg: string, err?: Error | unknown, ctx?: LogContext) => this.fatal(msg, err, { ...merged, ...ctx }),
    }
  }
}

export interface ScopedLogger {
  trace(message: string, context?: LogContext): void
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, error?: Error | unknown, context?: LogContext): void
  fatal(message: string, error?: Error | unknown, context?: LogContext): void
}

export const logger = new Logger()


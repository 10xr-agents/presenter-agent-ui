import mongoose, { Schema } from "mongoose"

/**
 * Debug Log Model
 *
 * Stores API request/response logs, execution metrics, and error details for debug UI.
 * Used by debug logging middleware and GET /api/debug/logs endpoint.
 *
 * Tenant ID: userId (normal mode) or organizationId (organization mode)
 */
export interface IDebugLog extends mongoose.Document {
  tenantId: string // userId or organizationId (indexed)
  taskId?: string // Link to task (optional, indexed)
  logType: "api_request" | "api_response" | "execution_metric" | "error"
  endpoint: string // API endpoint (e.g., "/api/agent/interact")
  method: string // HTTP method (e.g., "POST")
  requestData?: Record<string, unknown> // Request payload (masked for sensitive fields)
  responseData?: Record<string, unknown> // Response payload
  headers?: Record<string, string> // Request headers (masked for Authorization)
  statusCode: number // HTTP status code
  duration: number // Request duration in milliseconds
  timestamp: Date // When log was created (indexed)
  error?: {
    type?: string
    message?: string
    stack?: string
  } // Error details if request failed
  metadata?: Record<string, unknown> // Additional debug metadata
  createdAt: Date
  updatedAt: Date
}

const DebugLogSchema = new Schema<IDebugLog>(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    taskId: {
      type: String,
      required: false,
      index: true,
    },
    logType: {
      type: String,
      enum: ["api_request", "api_response", "execution_metric", "error"],
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
    },
    requestData: {
      type: Schema.Types.Mixed,
      required: false,
    },
    responseData: {
      type: Schema.Types.Mixed,
      required: false,
    },
    headers: {
      type: Schema.Types.Mixed,
      required: false,
    },
    statusCode: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    error: {
      type: {
        type: String,
        required: false,
      },
      message: {
        type: String,
        required: false,
      },
      stack: {
        type: String,
        required: false,
      },
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
  }
)

// Indexes for efficient queries
DebugLogSchema.index({ tenantId: 1, timestamp: -1 }) // For tenant-scoped log queries
DebugLogSchema.index({ taskId: 1, timestamp: -1 }) // For task-specific log queries
DebugLogSchema.index({ tenantId: 1, logType: 1, timestamp: -1 }) // For filtered queries

export const DebugLog =
  mongoose.models.DebugLog || mongoose.model<IDebugLog>("DebugLog", DebugLogSchema)

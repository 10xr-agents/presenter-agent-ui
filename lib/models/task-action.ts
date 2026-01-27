import mongoose, { Schema } from "mongoose"

/**
 * Task Action Model
 *
 * Action history per task for Thin Client action loop (Task 3).
 * Stores each step (thought, action) executed during a multi-step task.
 *
 * - Appended on each successful POST /api/agent/interact
 * - Used to build LLM prompt with server-held history
 * - Unique on (tenantId, taskId, stepIndex) to prevent duplicates
 * - All accesses scoped by tenantId and taskId
 *
 * Tenant ID: userId (normal mode) or organizationId (organization mode)
 */
// Task 7: Expected outcome structure for verification
export interface ExpectedOutcome {
  description?: string // Natural language description
  domChanges?: {
    elementShouldExist?: string // Element selector
    elementShouldNotExist?: string // Element selector
    elementShouldHaveText?: {
      selector: string
      text: string
    }
    urlShouldChange?: boolean
    // Popup/dropdown handling (CRITICAL FIX)
    attributeChanges?: Array<{
      attribute: string // e.g., 'aria-expanded'
      expectedValue: string // e.g., 'true'
    }>
    elementsToAppear?: Array<{
      role?: string // e.g., 'menuitem', 'option', 'dialog'
      selector?: string // Optional selector
    }>
    elementsToDisappear?: Array<{
      role?: string
      selector?: string
    }>
  }
  [key: string]: unknown // Allow additional fields
}

export interface ITaskAction extends mongoose.Document {
  tenantId: string // userId or organizationId
  taskId: string // References Task._id
  userId: string // User who initiated the task
  stepIndex: number // 0, 1, 2, ... (order of actions)
  thought: string // LLM reasoning for this step
  action: string // Action string (e.g. "click(123)", "setValue(456, 'text')", "finish()")
  // Execution metrics (Task 3)
  metrics?: {
    requestDuration: number // Total request processing time in milliseconds
    ragDuration?: number // RAG retrieval duration in milliseconds
    llmDuration?: number // LLM call duration in milliseconds
    tokenUsage?: {
      promptTokens: number
      completionTokens: number
    }
  }
  // Task 7: Verification fields
  expectedOutcome?: ExpectedOutcome // What should happen after this action
  domSnapshot?: string // DOM state when action was taken (for comparison)
  createdAt: Date
}

const TaskActionSchema = new Schema<ITaskAction>(
  {
    tenantId: {
      type: String,
      required: true,
    },
    taskId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    stepIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    thought: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    metrics: {
      requestDuration: {
        type: Number,
        required: false,
      },
      ragDuration: {
        type: Number,
        required: false,
      },
      llmDuration: {
        type: Number,
        required: false,
      },
      tokenUsage: {
        promptTokens: {
          type: Number,
          required: false,
        },
        completionTokens: {
          type: Number,
          required: false,
        },
      },
    },
    // Task 7: Verification fields
    expectedOutcome: {
      type: Schema.Types.Mixed,
      required: false,
    },
    domSnapshot: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

// Unique index on (tenantId, taskId, stepIndex) to prevent duplicates
// Also serves for efficient history loading (ordered by stepIndex)
TaskActionSchema.index({ tenantId: 1, taskId: 1, stepIndex: 1 }, { unique: true })

export const TaskAction =
  mongoose.models.TaskAction ||
  mongoose.model<ITaskAction>("TaskAction", TaskActionSchema)

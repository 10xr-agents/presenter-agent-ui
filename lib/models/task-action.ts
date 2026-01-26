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
export interface ITaskAction extends mongoose.Document {
  tenantId: string // userId or organizationId
  taskId: string // References Task._id
  userId: string // User who initiated the task
  stepIndex: number // 0, 1, 2, ... (order of actions)
  thought: string // LLM reasoning for this step
  action: string // Action string (e.g. "click(123)", "setValue(456, 'text')", "finish()")
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

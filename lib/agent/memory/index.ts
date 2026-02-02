/**
 * Memory Module
 *
 * Hierarchical memory layer for AI agent sessions:
 * - Task Memory (default): Automatically available per task
 * - Session Memory (opt-in): Persistent across tasks
 *
 * @module lib/agent/memory
 */

// Memory Service - Core CRUD operations
export {
  taskRemember,
  taskRecall,
  taskRecallAll,
  sessionRecall,
  sessionRecallAll,
  sessionRemember,
  exportToSessionMemory,
  taskForget,
  sessionForget,
  type MemoryOperationResult,
} from "./memory-service"

// Memory Action Handler - LLM action routing
export {
  handleMemoryAction,
  isMemoryAction,
  parseMemoryAction,
  type MemoryActionInput,
  type MemoryActionResult,
} from "./memory-action-handler"

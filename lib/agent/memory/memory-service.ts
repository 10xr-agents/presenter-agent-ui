/**
 * Memory Service
 *
 * Core CRUD operations for hierarchical memory layer:
 * - Task Memory (default): Automatically available per task, stores intermediate results
 * - Session Memory (opt-in): Persistent across tasks, populated via explicit export
 *
 * LLM Interface: Explicit actions (remember, recall, exportToSession)
 */

import { connectDB } from "@/lib/db/mongoose"
import { Task } from "@/lib/models/task"
import { BrowserSession } from "@/lib/models/session"

/**
 * Result type for memory operations
 */
export interface MemoryOperationResult {
  success: boolean
  value?: unknown
  error?: string
}

/**
 * Store a value in task memory
 *
 * @param taskId - The task ID
 * @param key - Descriptive key name
 * @param value - Value to store (must be JSON-serializable)
 * @returns Operation result
 */
export async function taskRemember(
  taskId: string,
  key: string,
  value: unknown
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    const result = await (Task as any).findOneAndUpdate(
      { taskId },
      { $set: { [`memory.${key}`]: value } },
      { new: true }
    )

    if (!result) {
      return {
        success: false,
        error: `Task not found: ${taskId}`,
      }
    }

    return { success: true, value }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Retrieve a value from task memory
 *
 * @param taskId - The task ID
 * @param key - Key to retrieve
 * @returns The value or undefined if not found
 */
export async function taskRecall(
  taskId: string,
  key: string
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    const task = await (Task as any).findOne(
      { taskId },
      { [`memory.${key}`]: 1 }
    )

    if (!task) {
      return {
        success: false,
        error: `Task not found: ${taskId}`,
      }
    }

    const memory = (task.memory ?? {}) as Record<string, unknown>
    const value = memory[key]

    return {
      success: true,
      value: value !== undefined ? value : null,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Retrieve all values from task memory
 *
 * @param taskId - The task ID
 * @returns All task memory as Record<string, unknown>
 */
export async function taskRecallAll(
  taskId: string
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    const task = await (Task as any).findOne({ taskId }, { memory: 1 })

    if (!task) {
      return {
        success: false,
        error: `Task not found: ${taskId}`,
      }
    }

    return {
      success: true,
      value: (task.memory ?? {}) as Record<string, unknown>,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Retrieve a value from session memory
 *
 * @param sessionId - The session ID
 * @param key - Key to retrieve
 * @returns The value or undefined if not found
 */
export async function sessionRecall(
  sessionId: string,
  key: string
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    const session = await (BrowserSession as any).findOne(
      { sessionId },
      { [`memory.${key}`]: 1 }
    )

    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      }
    }

    const memory = (session.memory ?? {}) as Record<string, unknown>
    const value = memory[key]

    return {
      success: true,
      value: value !== undefined ? value : null,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Retrieve all values from session memory
 *
 * @param sessionId - The session ID
 * @returns All session memory as Record<string, unknown>
 */
export async function sessionRecallAll(
  sessionId: string
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    const session = await (BrowserSession as any).findOne(
      { sessionId },
      { memory: 1 }
    )

    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      }
    }

    return {
      success: true,
      value: (session.memory ?? {}) as Record<string, unknown>,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Export a value from task memory to session memory
 *
 * @param sessionId - The session ID
 * @param taskId - The task ID
 * @param key - Key in task memory to export
 * @param sessionKey - Optional different key for session memory (defaults to same key)
 * @returns Operation result
 */
export async function exportToSessionMemory(
  sessionId: string,
  taskId: string,
  key: string,
  sessionKey?: string
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    // First, get the value from task memory
    const task = await (Task as any).findOne(
      { taskId },
      { [`memory.${key}`]: 1 }
    )

    if (!task) {
      return {
        success: false,
        error: `Task not found: ${taskId}`,
      }
    }

    const taskMemory = (task.memory ?? {}) as Record<string, unknown>
    const value = taskMemory[key]

    if (value === undefined) {
      return {
        success: false,
        error: `Key "${key}" not found in task memory`,
      }
    }

    // Export to session memory using the sessionKey (or same key if not provided)
    const targetKey = sessionKey ?? key
    const session = await (BrowserSession as any).findOneAndUpdate(
      { sessionId },
      { $set: { [`memory.${targetKey}`]: value } },
      { new: true }
    )

    if (!session) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      }
    }

    return {
      success: true,
      value,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Store a value directly in session memory (for internal use)
 *
 * @param sessionId - The session ID
 * @param key - Descriptive key name
 * @param value - Value to store (must be JSON-serializable)
 * @returns Operation result
 */
export async function sessionRemember(
  sessionId: string,
  key: string,
  value: unknown
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    const result = await (BrowserSession as any).findOneAndUpdate(
      { sessionId },
      { $set: { [`memory.${key}`]: value } },
      { new: true }
    )

    if (!result) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      }
    }

    return { success: true, value }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Clear a specific key from task memory
 *
 * @param taskId - The task ID
 * @param key - Key to clear
 * @returns Operation result
 */
export async function taskForget(
  taskId: string,
  key: string
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    const result = await (Task as any).findOneAndUpdate(
      { taskId },
      { $unset: { [`memory.${key}`]: 1 } },
      { new: true }
    )

    if (!result) {
      return {
        success: false,
        error: `Task not found: ${taskId}`,
      }
    }

    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

/**
 * Clear a specific key from session memory
 *
 * @param sessionId - The session ID
 * @param key - Key to clear
 * @returns Operation result
 */
export async function sessionForget(
  sessionId: string,
  key: string
): Promise<MemoryOperationResult> {
  try {
    await connectDB()

    const result = await (BrowserSession as any).findOneAndUpdate(
      { sessionId },
      { $unset: { [`memory.${key}`]: 1 } },
      { new: true }
    )

    if (!result) {
      return {
        success: false,
        error: `Session not found: ${sessionId}`,
      }
    }

    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: message }
  }
}

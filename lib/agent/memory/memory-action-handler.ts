/**
 * Memory Action Handler
 *
 * Routes memory actions from LLM to the appropriate memory service function.
 * Returns structured results for LLM context.
 *
 * Supported actions:
 * - remember: Store a value in task memory
 * - recall: Retrieve a value from memory (task or session scope)
 * - exportToSession: Export a task memory value to session memory
 */

import {
  taskRemember,
  taskRecall,
  taskRecallAll,
  sessionRecall,
  sessionRecallAll,
  exportToSessionMemory,
  type MemoryOperationResult,
} from "./memory-service"

/**
 * Input for memory action handling
 */
export interface MemoryActionInput {
  actionName: "remember" | "recall" | "exportToSession"
  taskId: string
  sessionId: string
  parameters: Record<string, unknown>
}

/**
 * Result from memory action handling
 */
export interface MemoryActionResult {
  success: boolean
  action: string
  key?: string
  scope?: "task" | "session"
  value?: unknown
  error?: string
  message: string
}

/**
 * Handle a memory action from the LLM
 *
 * @param input - Memory action input
 * @returns Structured result for LLM context
 */
export async function handleMemoryAction(
  input: MemoryActionInput
): Promise<MemoryActionResult> {
  const { actionName, taskId, sessionId, parameters } = input

  switch (actionName) {
    case "remember":
      return handleRemember(taskId, parameters)
    case "recall":
      return handleRecall(taskId, sessionId, parameters)
    case "exportToSession":
      return handleExportToSession(taskId, sessionId, parameters)
    default:
      return {
        success: false,
        action: actionName,
        error: `Unknown memory action: ${actionName}`,
        message: `Unknown memory action: ${actionName}`,
      }
  }
}

/**
 * Handle the "remember" action - store value in task memory
 */
async function handleRemember(
  taskId: string,
  parameters: Record<string, unknown>
): Promise<MemoryActionResult> {
  const key = parameters.key as string | undefined
  const value = parameters.value

  if (!key) {
    return {
      success: false,
      action: "remember",
      error: "Missing required parameter: key",
      message: "Failed to store value: missing key",
    }
  }

  if (value === undefined) {
    return {
      success: false,
      action: "remember",
      key,
      error: "Missing required parameter: value",
      message: `Failed to store value for key "${key}": missing value`,
    }
  }

  const result: MemoryOperationResult = await taskRemember(taskId, key, value)

  if (result.success) {
    return {
      success: true,
      action: "remember",
      key,
      scope: "task",
      value,
      message: `Stored "${key}" in task memory`,
    }
  }

  return {
    success: false,
    action: "remember",
    key,
    error: result.error,
    message: `Failed to store "${key}": ${result.error}`,
  }
}

/**
 * Handle the "recall" action - retrieve value from memory
 */
async function handleRecall(
  taskId: string,
  sessionId: string,
  parameters: Record<string, unknown>
): Promise<MemoryActionResult> {
  const key = parameters.key as string | undefined
  const scope = (parameters.scope as "task" | "session" | undefined) ?? "task"

  if (!key) {
    return {
      success: false,
      action: "recall",
      error: "Missing required parameter: key",
      message: "Failed to recall value: missing key",
    }
  }

  // Handle "*" key to recall all memory
  if (key === "*") {
    const result: MemoryOperationResult =
      scope === "session"
        ? await sessionRecallAll(sessionId)
        : await taskRecallAll(taskId)

    if (result.success) {
      return {
        success: true,
        action: "recall",
        key: "*",
        scope,
        value: result.value,
        message: `Retrieved all ${scope} memory`,
      }
    }

    return {
      success: false,
      action: "recall",
      key: "*",
      scope,
      error: result.error,
      message: `Failed to recall all ${scope} memory: ${result.error}`,
    }
  }

  // Recall specific key
  const result: MemoryOperationResult =
    scope === "session"
      ? await sessionRecall(sessionId, key)
      : await taskRecall(taskId, key)

  if (result.success) {
    const valueExists = result.value !== null && result.value !== undefined
    return {
      success: true,
      action: "recall",
      key,
      scope,
      value: result.value,
      message: valueExists
        ? `Retrieved "${key}" from ${scope} memory`
        : `Key "${key}" not found in ${scope} memory`,
    }
  }

  return {
    success: false,
    action: "recall",
    key,
    scope,
    error: result.error,
    message: `Failed to recall "${key}" from ${scope} memory: ${result.error}`,
  }
}

/**
 * Handle the "exportToSession" action - export task memory to session memory
 */
async function handleExportToSession(
  taskId: string,
  sessionId: string,
  parameters: Record<string, unknown>
): Promise<MemoryActionResult> {
  const key = parameters.key as string | undefined
  const sessionKey = parameters.sessionKey as string | undefined

  if (!key) {
    return {
      success: false,
      action: "exportToSession",
      error: "Missing required parameter: key",
      message: "Failed to export: missing key",
    }
  }

  const result: MemoryOperationResult = await exportToSessionMemory(
    sessionId,
    taskId,
    key,
    sessionKey
  )

  if (result.success) {
    const targetKey = sessionKey ?? key
    return {
      success: true,
      action: "exportToSession",
      key,
      scope: "session",
      value: result.value,
      message: `Exported "${key}" to session memory as "${targetKey}"`,
    }
  }

  return {
    success: false,
    action: "exportToSession",
    key,
    error: result.error,
    message: `Failed to export "${key}" to session: ${result.error}`,
  }
}

/**
 * Check if an action name is a memory action
 */
export function isMemoryAction(actionName: string): boolean {
  return ["remember", "recall", "exportToSession"].includes(actionName)
}

/**
 * Parse memory action from action string
 *
 * @param actionString - Action string like 'remember("key", value)' or 'recall("key", "session")'
 * @returns Parsed action details or null if not a memory action
 */
export function parseMemoryAction(
  actionString: string
): { actionName: string; parameters: Record<string, unknown> } | null {
  const trimmed = actionString.trim()

  // Extract action name
  const parenIndex = trimmed.indexOf("(")
  if (parenIndex === -1) return null

  const actionName = trimmed.substring(0, parenIndex)
  if (!isMemoryAction(actionName)) return null

  // Extract parameters string
  const paramsStr = trimmed.substring(parenIndex + 1, trimmed.lastIndexOf(")"))

  // Parse based on action type
  try {
    switch (actionName) {
      case "remember": {
        // remember("key", value)
        const firstComma = paramsStr.indexOf(",")
        if (firstComma === -1) return null

        const keyPart = paramsStr.substring(0, firstComma).trim()
        const valuePart = paramsStr.substring(firstComma + 1).trim()

        // Remove quotes from key
        const key = keyPart.replace(/^["']|["']$/g, "")

        // Parse value (could be JSON or primitive)
        let value: unknown
        try {
          value = JSON.parse(valuePart)
        } catch {
          // If not valid JSON, treat as string
          value = valuePart.replace(/^["']|["']$/g, "")
        }

        return { actionName, parameters: { key, value } }
      }

      case "recall": {
        // recall("key") or recall("key", "session")
        const parts = paramsStr.split(",").map((p) => p.trim())
        const key = parts[0]?.replace(/^["']|["']$/g, "") ?? ""
        const scope =
          parts[1]?.replace(/^["']|["']$/g, "") === "session" ? "session" : "task"

        return { actionName, parameters: { key, scope } }
      }

      case "exportToSession": {
        // exportToSession("key") or exportToSession("key", "sessionKey")
        const parts = paramsStr.split(",").map((p) => p.trim())
        const key = parts[0]?.replace(/^["']|["']$/g, "") ?? ""
        const sessionKey = parts[1]?.replace(/^["']|["']$/g, "")

        return {
          actionName,
          parameters: sessionKey ? { key, sessionKey } : { key },
        }
      }

      default:
        return null
    }
  } catch {
    return null
  }
}

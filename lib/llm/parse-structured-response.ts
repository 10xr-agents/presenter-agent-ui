/**
 * Safe parsing utilities for Gemini structured output responses.
 *
 * Even though Gemini's structured output (responseMimeType: "application/json" + responseJsonSchema)
 * guarantees valid JSON, there are edge cases where parsing can fail:
 *
 * 1. **Invisible characters**: BOM (Byte Order Mark), zero-width spaces, or other Unicode artifacts
 * 2. **Markdown wrapping**: Some edge cases may include ```json code fences despite structured output
 * 3. **Truncation**: Response may be cut off if maxOutputTokens is exceeded
 * 4. **Encoding issues**: Character encoding mismatches
 * 5. **Grounding artifacts**: When useGoogleSearchGrounding is enabled, rare artifacts may appear
 *
 * This module provides `parseStructuredResponse<T>()` which handles these edge cases gracefully
 * and provides detailed diagnostics when parsing fails unexpectedly.
 *
 * @see https://ai.google.dev/gemini-api/docs/structured-output
 * @see docs/GEMINI_USAGE.md (Structured Output Edge Cases section)
 */

import * as Sentry from "@sentry/nextjs"
import { logger } from "@/lib/utils/logger"

export interface ParseResult<T> {
  success: true
  data: T
}

export interface ParseError {
  success: false
  error: string
  rawContent: string
  diagnostics: ParseDiagnostics
}

export interface ParseDiagnostics {
  /** Original content length */
  contentLength: number
  /** Content after sanitization */
  sanitizedLength: number
  /** Whether markdown fences were stripped */
  hadMarkdownFences: boolean
  /** Whether invisible characters were removed */
  hadInvisibleChars: boolean
  /** First 200 chars of raw content for debugging */
  contentPreview: string
  /** Detected issue type */
  issueType:
    | "empty_content"
    | "markdown_wrapped"
    | "invisible_chars"
    | "truncated_json"
    | "invalid_json"
    | "schema_mismatch"
    | "unknown"
}

/**
 * Strip common invisible characters that can break JSON parsing.
 * Returns the cleaned string and whether any chars were removed.
 */
function stripInvisibleChars(content: string): { cleaned: string; hadInvisible: boolean } {
  // BOM, zero-width space, zero-width non-joiner, zero-width joiner, soft hyphen
  const invisiblePattern = /[\uFEFF\u200B\u200C\u200D\u00AD]/g
  const cleaned = content.replace(invisiblePattern, "")
  return {
    cleaned,
    hadInvisible: cleaned.length !== content.length,
  }
}

/**
 * Strip markdown code fences if present.
 * Handles: ```json ... ```, ``` ... ```, and leading/trailing whitespace.
 */
function stripMarkdownFences(content: string): { cleaned: string; hadFences: boolean } {
  const trimmed = content.trim()

  // Pattern for ```json ... ``` or ``` ... ```
  const fencePattern = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```$/
  const match = trimmed.match(fencePattern)

  if (match?.[1]) {
    return {
      cleaned: match[1].trim(),
      hadFences: true,
    }
  }

  return {
    cleaned: trimmed,
    hadFences: false,
  }
}

/**
 * Check if JSON appears truncated (unbalanced braces/brackets).
 */
function checkTruncation(content: string): boolean {
  let braceCount = 0
  let bracketCount = 0
  let inString = false
  let escapeNext = false

  for (const char of content) {
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (char === "\\") {
      escapeNext = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === "{") braceCount++
    else if (char === "}") braceCount--
    else if (char === "[") bracketCount++
    else if (char === "]") bracketCount--
  }

  return braceCount !== 0 || bracketCount !== 0
}

/**
 * Attempt to repair truncated JSON by closing open structures.
 * This is a best-effort approach for graceful degradation.
 */
function attemptRepairTruncatedJson(content: string): string | null {
  // Only attempt repair if it looks like JSON
  const trimmed = content.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null
  }

  // Track what needs closing
  const stack: string[] = []
  let inString = false
  let escapeNext = false

  for (const char of trimmed) {
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (char === "\\") {
      escapeNext = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === "{") stack.push("}")
    else if (char === "[") stack.push("]")
    else if (char === "}" || char === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === char) {
        stack.pop()
      }
    }
  }

  if (stack.length === 0) return trimmed

  // Close in reverse order
  let repaired = trimmed

  // If we're in a string, close it first
  if (inString) {
    repaired += '"'
  }

  // Close remaining structures
  while (stack.length > 0) {
    const closer = stack.pop()
    if (closer) repaired += closer
  }

  return repaired
}

/**
 * Safely parse a Gemini structured output response.
 *
 * This function handles edge cases that can occur even with structured output enabled:
 * - Invisible characters (BOM, zero-width spaces)
 * - Markdown code fences (rare edge case)
 * - Truncated JSON (when maxOutputTokens exceeded)
 *
 * @param content - Raw response.text from Gemini
 * @param context - Optional context for logging/Sentry (e.g. { generationName, taskId })
 * @returns ParseResult<T> on success, ParseError on failure
 *
 * @example
 * ```typescript
 * const result = parseStructuredResponse<VerificationResponse>(content, { generationName: "verification" })
 * if (result.success) {
 *   const { action_succeeded, task_completed } = result.data
 * } else {
 *   log.error(`Parse failed: ${result.error}`, result.diagnostics)
 * }
 * ```
 */
export function parseStructuredResponse<T>(
  content: string | null | undefined,
  context?: {
    generationName?: string
    taskId?: string
    sessionId?: string
    schemaName?: string
  }
): ParseResult<T> | ParseError {
  const log = logger.child({
    process: "StructuredResponseParser",
    sessionId: context?.sessionId,
    taskId: context?.taskId,
  })

  // Handle empty/null content
  if (content == null || content === "") {
    const diagnostics: ParseDiagnostics = {
      contentLength: 0,
      sanitizedLength: 0,
      hadMarkdownFences: false,
      hadInvisibleChars: false,
      contentPreview: "",
      issueType: "empty_content",
    }
    return {
      success: false,
      error: "Empty content received from Gemini",
      rawContent: "",
      diagnostics,
    }
  }

  const originalLength = content.length

  // Step 1: Strip invisible characters
  const { cleaned: afterInvisible, hadInvisible } = stripInvisibleChars(content)

  // Step 2: Strip markdown fences if present
  const { cleaned: sanitized, hadFences } = stripMarkdownFences(afterInvisible)

  // Step 3: Check for truncation
  const isTruncated = checkTruncation(sanitized)

  // Step 4: Attempt to parse
  try {
    let jsonToParse = sanitized

    // If truncated, attempt repair
    if (isTruncated) {
      const repaired = attemptRepairTruncatedJson(sanitized)
      if (repaired) {
        jsonToParse = repaired
        log.warn(
          `Structured output appears truncated, attempting repair`,
          { generationName: context?.generationName, originalLength }
        )
      }
    }

    const parsed = JSON.parse(jsonToParse) as T

    // Log if we had to do any sanitization
    if (hadInvisible || hadFences || isTruncated) {
      log.warn(
        `Structured output required sanitization: invisible=${hadInvisible}, fences=${hadFences}, truncated=${isTruncated}`,
        {
          generationName: context?.generationName,
          originalLength,
          sanitizedLength: sanitized.length,
        }
      )
    }

    return {
      success: true,
      data: parsed,
    }
  } catch (parseError: unknown) {
    // Determine issue type
    let issueType: ParseDiagnostics["issueType"] = "unknown"
    if (hadFences) {
      issueType = "markdown_wrapped"
    } else if (hadInvisible) {
      issueType = "invisible_chars"
    } else if (isTruncated) {
      issueType = "truncated_json"
    } else {
      issueType = "invalid_json"
    }

    const diagnostics: ParseDiagnostics = {
      contentLength: originalLength,
      sanitizedLength: sanitized.length,
      hadMarkdownFences: hadFences,
      hadInvisibleChars: hadInvisible,
      contentPreview: content.substring(0, 200),
      issueType,
    }

    const errorMessage =
      parseError instanceof Error ? parseError.message : "Unknown parse error"

    // Log and report to Sentry
    log.error(
      `Structured output parse failed: ${errorMessage}`,
      {
        ...diagnostics,
        generationName: context?.generationName,
        schemaName: context?.schemaName,
      }
    )

    Sentry.captureException(new Error(`Gemini structured output parse failed: ${issueType}`), {
      tags: {
        component: "structured-response-parser",
        issueType,
        generationName: context?.generationName ?? "unknown",
      },
      extra: {
        diagnostics,
        parseError: errorMessage,
        schemaName: context?.schemaName,
      },
    })

    return {
      success: false,
      error: errorMessage,
      rawContent: content,
      diagnostics,
    }
  }
}

/**
 * Helper to extract a typed field with default fallback.
 * Useful when dealing with partial parse results or schema mismatches.
 */
export function getField<T, K extends keyof T>(
  data: Partial<T> | undefined,
  key: K,
  defaultValue: T[K]
): T[K] {
  if (data == null) return defaultValue
  const value = data[key]
  return value !== undefined ? value : defaultValue
}

/**
 * Type guard to check if parse result is successful.
 */
export function isParseSuccess<T>(
  result: ParseResult<T> | ParseError
): result is ParseResult<T> {
  return result.success === true
}

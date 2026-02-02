/**
 * Task Type Classifier
 *
 * Classifies tasks based on query, attachments, and context to determine
 * if task requires browser interaction (web_only, web_with_file) or can
 * be handled directly without browser (chat_only).
 *
 * @see docs/INTERACT_FLOW_WALKTHROUGH.md
 */

import type { TaskType } from "@/lib/models/task"

/**
 * Task type classification result
 */
export interface TaskTypeClassification {
  taskType: TaskType
  confidence: number
  reason: string
  requiresBrowser: boolean
  hasFileContext: boolean
}

/**
 * Parameters for task type classification
 */
export interface ClassifyTaskParams {
  query: string
  hasAttachment: boolean
  hasUrl: boolean
  attachmentMimeType?: string
  sessionMemory?: Record<string, unknown>
}

// Patterns that indicate web interaction is needed
const WEB_PATTERNS = [
  // Click/interaction patterns
  /\b(click|tap|press|select|choose|pick)\b/i,
  // Input patterns
  /\b(fill|enter|type|input|write|set)\s+(in|into|the|a|an)?\s*(form|field|input|text|box)/i,
  // Navigation patterns
  /\b(navigate|go\s+to|open|visit|browse|load)\s+(the\s+)?(page|site|website|url|link)/i,
  // Form submission
  /\b(submit|send|confirm|save|post|update)\s+(the\s+)?(form|data|changes)/i,
  // Scroll/drag
  /\b(scroll|drag|hover|swipe|move)\b/i,
  // Auth patterns
  /\b(login|log\s+in|sign\s+in|register|sign\s+up|authenticate)\b/i,
  // CRUD operations on web
  /\b(add|create|delete|remove|update|edit|modify)\s+(a|an|the|new)?\s*\w+\s+(on|to|in|from)\s+(the\s+)?(page|site|form|table|list)/i,
  // Web-specific actions
  /\b(download|upload|attach)\s+(the\s+)?(file|document|image)/i,
  // Explicit web references
  /\bon\s+(the\s+)?(page|website|site|screen|browser)\b/i,
]

// Patterns that indicate chat-only (no browser needed)
const CHAT_ONLY_PATTERNS = [
  // Questions/analysis
  /^(what|how|why|when|where|who|which|can\s+you|could\s+you)\s/i,
  /\b(what\s+is|what's|what\s+are|how\s+many|how\s+much)\b/i,
  // Calculation/analysis
  /\b(calculate|sum|total|count|average|analyze|summarize|explain)\b/i,
  // List/show patterns (without web context)
  /^(list|show\s+me|tell\s+me|give\s+me|find)\s+(the\s+)?/i,
  // Memory/recall patterns
  /\b(remember|recall|what\s+did\s+(we|I)|previously|earlier|last\s+time)\b/i,
  // File analysis patterns
  /\b(from\s+the|in\s+the|using\s+the)\s+(file|csv|pdf|document|spreadsheet|data)\b/i,
  /\b(extract|parse|read)\s+(from|the)\s+(file|csv|pdf|document)\b/i,
  // Direct answers
  /\b(answer|respond|reply)\s+(with|to)\b/i,
  // General knowledge
  /\b(what\s+does|define|meaning\s+of|explain)\b/i,
]

// Patterns indicating file usage WITH web interaction
const WEB_WITH_FILE_PATTERNS = [
  /\b(fill|enter|input|type)\s+.*(from|using|with)\s+(the\s+)?(file|csv|pdf|data|document)/i,
  /\b(upload|attach)\s+(the\s+)?(file|csv|pdf|document|data)/i,
  /\b(use|using)\s+(the\s+)?(file|csv|pdf|document|data)\s+(to|for)\s+(fill|input|submit)/i,
  /\b(import|load)\s+(the\s+)?(data|file)\s+(into|to)\s+(the\s+)?(form|page|site)/i,
]

/**
 * Classify task type based on query and context
 *
 * @param params - Classification parameters
 * @returns Task type classification result
 */
export function classifyTaskType(params: ClassifyTaskParams): TaskTypeClassification {
  const { query, hasAttachment, hasUrl, attachmentMimeType: _attachmentMimeType, sessionMemory: _sessionMemory } = params

  const _queryLower = query.toLowerCase()

  // Check for web interaction patterns
  const matchesWebPattern = WEB_PATTERNS.some((pattern) => pattern.test(query))

  // Check for chat-only patterns
  const matchesChatOnlyPattern = CHAT_ONLY_PATTERNS.some((pattern) => pattern.test(query))

  // Check for web-with-file patterns
  const matchesWebWithFilePattern = WEB_WITH_FILE_PATTERNS.some((pattern) => pattern.test(query))

  // Decision logic
  let taskType: TaskType
  let confidence: number
  let reason: string

  // Priority 1: Web with file (explicit file + web usage)
  if (hasAttachment && (matchesWebWithFilePattern || (matchesWebPattern && !matchesChatOnlyPattern))) {
    taskType = "web_with_file"
    confidence = matchesWebWithFilePattern ? 0.95 : 0.8
    reason = matchesWebWithFilePattern
      ? "Query explicitly mentions using file data for web interaction"
      : "Query mentions web interaction with file attachment present"
  }
  // Priority 2: Chat-only (file analysis without web)
  else if (hasAttachment && matchesChatOnlyPattern && !matchesWebPattern) {
    taskType = "chat_only"
    confidence = 0.9
    reason = "Query asks for file analysis/information without web interaction"
  }
  // Priority 3: Chat-only (no file, no URL, chat patterns)
  else if (!hasUrl && !hasAttachment && matchesChatOnlyPattern && !matchesWebPattern) {
    taskType = "chat_only"
    confidence = 0.85
    reason = "Query is a question/analysis that doesn't require browser"
  }
  // Priority 4: Memory query (recall patterns without web)
  else if (isMemoryQuery(query) && !matchesWebPattern) {
    taskType = "chat_only"
    confidence = 0.9
    reason = "Query references previous conversation or stored memory"
  }
  // Priority 5: Web interaction (explicit patterns)
  else if (matchesWebPattern && hasUrl) {
    taskType = hasAttachment ? "web_with_file" : "web_only"
    confidence = 0.85
    reason = "Query indicates web interaction is required"
  }
  // Priority 6: No URL but web patterns (likely needs web)
  else if (matchesWebPattern && !hasUrl) {
    taskType = hasAttachment ? "web_with_file" : "web_only"
    confidence = 0.6
    reason = "Query indicates web interaction but no URL provided"
  }
  // Priority 7: Has URL but no clear pattern (default to web)
  else if (hasUrl) {
    taskType = hasAttachment ? "web_with_file" : "web_only"
    confidence = 0.7
    reason = "URL provided, defaulting to web interaction"
  }
  // Priority 8: Default to chat-only for ambiguous queries without URL
  else {
    taskType = hasAttachment ? "chat_only" : "chat_only"
    confidence = 0.5
    reason = "No clear web interaction needed, treating as direct question"
  }

  return {
    taskType,
    confidence,
    reason,
    requiresBrowser: taskType === "web_only" || taskType === "web_with_file",
    hasFileContext: hasAttachment,
  }
}

/**
 * Check if query is a memory/recall query
 */
function isMemoryQuery(query: string): boolean {
  const memoryPatterns = [
    /\b(what\s+did\s+(we|you|I))\b/i,
    /\b(remember|recall)\s+(when|what|the)\b/i,
    /\b(previously|earlier|before|last\s+time)\s+(we|you|I)?\s*(mentioned|said|discussed|talked|did)/i,
    /\b(our\s+previous|earlier)\s+(conversation|discussion|chat)/i,
    /\bhistory\s+of\s+(our|the)\b/i,
    /\b(what\s+tasks|which\s+tasks)\s+(did|have)\s+(we|I)\s+(complete|do|finish)/i,
  ]

  return memoryPatterns.some((pattern) => pattern.test(query))
}

/**
 * Determine if a file type is suitable for content extraction
 */
export function isExtractableFileType(mimeType: string): boolean {
  const extractableTypes = [
    // Documents
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
    "application/msword", // doc
    "text/plain",
    "text/markdown",
    "text/html",
    // Spreadsheets
    "text/csv",
    "application/vnd.ms-excel", // xls
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
    // Data formats
    "application/json",
    "application/xml",
    "text/xml",
  ]

  return extractableTypes.includes(mimeType) || mimeType.startsWith("text/")
}

/**
 * Get file category for display
 */
export function getFileCategory(mimeType: string): "document" | "spreadsheet" | "data" | "other" {
  if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("document")) {
    return "document"
  }
  if (mimeType.includes("csv") || mimeType.includes("excel") || mimeType.includes("spreadsheet")) {
    return "spreadsheet"
  }
  if (mimeType.includes("json") || mimeType.includes("xml")) {
    return "data"
  }
  return "other"
}

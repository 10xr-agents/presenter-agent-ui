/**
 * Report Generator
 *
 * Generates downloadable reports from task results in multiple formats:
 * - JSON: Full structured data
 * - CSV: Tabular data export
 * - Markdown: Human-readable summary
 *
 * @see docs/INTERACT_FLOW_WALKTHROUGH.md
 */

import * as Sentry from "@sentry/nextjs"
import { sessionRecallAll, taskRecallAll } from "@/lib/agent/memory"
import type { ITask, TaskAttachment } from "@/lib/models/task"

/**
 * Supported report formats
 */
export type ReportFormat = "json" | "csv" | "markdown"

/**
 * Report generation result
 */
export interface GeneratedReport {
  content: string
  mimeType: string
  filename: string
}

/**
 * Task data structure for report generation
 */
export interface TaskReportData {
  task: ITask
  actionHistory?: Array<{
    stepIndex: number
    action: string
    status: "success" | "failure" | "pending"
    thought?: string
    timestamp?: Date
  }>
  sessionId?: string
}

/**
 * Generate a task report in the specified format
 *
 * @param data - Task data for report generation
 * @param format - Output format (json, csv, markdown)
 * @returns Generated report with content and metadata
 */
export async function generateTaskReport(
  data: TaskReportData,
  format: ReportFormat
): Promise<GeneratedReport> {
  const { task, actionHistory, sessionId } = data

  try {
    // Collect all report data
    const reportData = await collectReportData(task, actionHistory, sessionId)

    // Generate report based on format
    switch (format) {
      case "json":
        return formatAsJson(reportData, task)
      case "csv":
        return formatAsCsv(reportData, task)
      case "markdown":
        return formatAsMarkdown(reportData, task)
      default:
        throw new Error(`Unsupported report format: ${format}`)
    }
  } catch (error: unknown) {
    Sentry.captureException(error, {
      tags: { component: "report-generator", format },
      extra: { taskId: task.taskId },
    })

    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to generate report: ${errorMessage}`)
  }
}

/**
 * Internal report data structure
 */
interface ReportDataCollected {
  taskInfo: {
    taskId: string
    query: string
    url: string
    status: string
    taskType?: string
    createdAt: Date
    updatedAt: Date
  }
  result?: {
    summary: string
    data?: Record<string, unknown>
    generatedAt?: Date
  }
  taskMemory: Record<string, unknown>
  sessionMemory: Record<string, unknown>
  actionHistory: Array<{
    stepIndex: number
    action: string
    status: string
    thought?: string
    timestamp?: Date
  }>
  attachments: Array<{
    filename: string
    mimeType: string
    size: number
    hasContent: boolean
  }>
  metrics?: {
    totalSteps: number
    totalDuration?: number
    totalTokens?: number
  }
}

/**
 * Collect all data needed for report generation
 */
async function collectReportData(
  task: ITask,
  actionHistory?: TaskReportData["actionHistory"],
  sessionId?: string
): Promise<ReportDataCollected> {
  // Load memory context
  let taskMemory: Record<string, unknown> = {}
  let sessionMemory: Record<string, unknown> = {}

  try {
    const [taskMemoryResult, sessionMemoryResult] = await Promise.all([
      task.taskId ? taskRecallAll(task.taskId) : Promise.resolve({ success: true, value: {} }),
      sessionId ? sessionRecallAll(sessionId) : Promise.resolve({ success: true, value: {} }),
    ])

    taskMemory = (taskMemoryResult.success ? taskMemoryResult.value : {}) as Record<string, unknown>
    sessionMemory = (sessionMemoryResult.success ? sessionMemoryResult.value : {}) as Record<string, unknown>
  } catch (err: unknown) {
    console.warn("[Report Generator] Failed to load memory:", err)
  }

  // Process attachments
  const attachments = (task.attachments || []).map((att: TaskAttachment) => ({
    filename: att.filename,
    mimeType: att.mimeType,
    size: att.size,
    hasContent: Boolean(att.extractedContent && att.extractedContent.length > 0),
  }))

  // Build metrics
  const metrics = task.metrics
    ? {
        totalSteps: task.metrics.totalSteps,
        totalDuration: task.metrics.totalRequestDuration,
        totalTokens:
          (task.metrics.totalTokenUsage?.promptTokens || 0) +
          (task.metrics.totalTokenUsage?.completionTokens || 0),
      }
    : undefined

  return {
    taskInfo: {
      taskId: task.taskId,
      query: task.query,
      url: task.url,
      status: task.status,
      taskType: task.taskType,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    },
    result: task.result,
    taskMemory,
    sessionMemory,
    actionHistory: actionHistory || [],
    attachments,
    metrics,
  }
}

/**
 * Format report as JSON
 */
function formatAsJson(data: ReportDataCollected, task: ITask): GeneratedReport {
  const report = {
    reportType: "task_report",
    generatedAt: new Date().toISOString(),
    task: data.taskInfo,
    result: data.result,
    memory: {
      task: data.taskMemory,
      session: data.sessionMemory,
    },
    actionHistory: data.actionHistory,
    attachments: data.attachments,
    metrics: data.metrics,
  }

  return {
    content: JSON.stringify(report, null, 2),
    mimeType: "application/json",
    filename: `task-report-${task.taskId.substring(0, 8)}.json`,
  }
}

/**
 * Format report as CSV
 */
function formatAsCsv(data: ReportDataCollected, task: ITask): GeneratedReport {
  const rows: string[][] = []

  // Header row
  rows.push(["Section", "Field", "Value"])

  // Task info
  rows.push(["Task", "ID", data.taskInfo.taskId])
  rows.push(["Task", "Query", escapeForCsv(data.taskInfo.query)])
  rows.push(["Task", "URL", data.taskInfo.url])
  rows.push(["Task", "Status", data.taskInfo.status])
  rows.push(["Task", "Type", data.taskInfo.taskType || "web_only"])
  rows.push(["Task", "Created", data.taskInfo.createdAt.toISOString()])
  rows.push(["Task", "Updated", data.taskInfo.updatedAt.toISOString()])

  // Result
  if (data.result) {
    rows.push(["Result", "Summary", escapeForCsv(data.result.summary)])
    if (data.result.data) {
      rows.push(["Result", "Data", escapeForCsv(JSON.stringify(data.result.data))])
    }
  }

  // Task memory
  for (const [key, value] of Object.entries(data.taskMemory)) {
    rows.push(["TaskMemory", key, escapeForCsv(stringifyValue(value))])
  }

  // Session memory
  for (const [key, value] of Object.entries(data.sessionMemory)) {
    rows.push(["SessionMemory", key, escapeForCsv(stringifyValue(value))])
  }

  // Action history
  data.actionHistory.forEach((action) => {
    rows.push([
      "ActionHistory",
      `Step ${action.stepIndex}`,
      escapeForCsv(`${action.action} (${action.status})`),
    ])
  })

  // Attachments
  data.attachments.forEach((att) => {
    rows.push([
      "Attachment",
      att.filename,
      `${att.mimeType}, ${formatFileSize(att.size)}, content: ${att.hasContent}`,
    ])
  })

  // Metrics
  if (data.metrics) {
    rows.push(["Metrics", "Total Steps", String(data.metrics.totalSteps)])
    if (data.metrics.totalDuration) {
      rows.push(["Metrics", "Total Duration (ms)", String(data.metrics.totalDuration)])
    }
    if (data.metrics.totalTokens) {
      rows.push(["Metrics", "Total Tokens", String(data.metrics.totalTokens)])
    }
  }

  // Convert to CSV string
  const csvContent = rows.map((row) => row.join(",")).join("\n")

  return {
    content: csvContent,
    mimeType: "text/csv",
    filename: `task-report-${task.taskId.substring(0, 8)}.csv`,
  }
}

/**
 * Format report as Markdown
 */
function formatAsMarkdown(data: ReportDataCollected, task: ITask): GeneratedReport {
  const lines: string[] = []

  // Title
  lines.push(`# Task Report`)
  lines.push("")
  lines.push(`**Generated:** ${new Date().toISOString()}`)
  lines.push("")

  // Task Info
  lines.push(`## Task Information`)
  lines.push("")
  lines.push(`- **ID:** \`${data.taskInfo.taskId}\``)
  lines.push(`- **Query:** ${data.taskInfo.query}`)
  lines.push(`- **URL:** ${data.taskInfo.url || "N/A"}`)
  lines.push(`- **Status:** ${data.taskInfo.status}`)
  lines.push(`- **Type:** ${data.taskInfo.taskType || "web_only"}`)
  lines.push(`- **Created:** ${data.taskInfo.createdAt.toISOString()}`)
  lines.push(`- **Updated:** ${data.taskInfo.updatedAt.toISOString()}`)
  lines.push("")

  // Result
  if (data.result) {
    lines.push(`## Result`)
    lines.push("")
    lines.push(data.result.summary)
    if (data.result.data && Object.keys(data.result.data).length > 0) {
      lines.push("")
      lines.push("**Data:**")
      lines.push("```json")
      lines.push(JSON.stringify(data.result.data, null, 2))
      lines.push("```")
    }
    lines.push("")
  }

  // Memory
  const hasTaskMemory = Object.keys(data.taskMemory).length > 0
  const hasSessionMemory = Object.keys(data.sessionMemory).length > 0

  if (hasTaskMemory || hasSessionMemory) {
    lines.push(`## Memory`)
    lines.push("")

    if (hasTaskMemory) {
      lines.push(`### Task Memory`)
      lines.push("")
      for (const [key, value] of Object.entries(data.taskMemory)) {
        lines.push(`- **${key}:** ${truncateValue(stringifyValue(value))}`)
      }
      lines.push("")
    }

    if (hasSessionMemory) {
      lines.push(`### Session Memory`)
      lines.push("")
      for (const [key, value] of Object.entries(data.sessionMemory)) {
        lines.push(`- **${key}:** ${truncateValue(stringifyValue(value))}`)
      }
      lines.push("")
    }
  }

  // Action History
  if (data.actionHistory.length > 0) {
    lines.push(`## Action History`)
    lines.push("")
    lines.push("| Step | Action | Status |")
    lines.push("|------|--------|--------|")
    data.actionHistory.forEach((action) => {
      const actionStr = truncateValue(action.action, 50)
      lines.push(`| ${action.stepIndex} | ${actionStr} | ${action.status} |`)
    })
    lines.push("")
  }

  // Attachments
  if (data.attachments.length > 0) {
    lines.push(`## Attachments`)
    lines.push("")
    data.attachments.forEach((att) => {
      lines.push(`- **${att.filename}** (${att.mimeType}, ${formatFileSize(att.size)})`)
    })
    lines.push("")
  }

  // Metrics
  if (data.metrics) {
    lines.push(`## Metrics`)
    lines.push("")
    lines.push(`- **Total Steps:** ${data.metrics.totalSteps}`)
    if (data.metrics.totalDuration) {
      lines.push(`- **Total Duration:** ${data.metrics.totalDuration}ms`)
    }
    if (data.metrics.totalTokens) {
      lines.push(`- **Total Tokens:** ${data.metrics.totalTokens}`)
    }
    lines.push("")
  }

  return {
    content: lines.join("\n"),
    mimeType: "text/markdown",
    filename: `task-report-${task.taskId.substring(0, 8)}.md`,
  }
}

/**
 * Escape value for CSV
 */
function escapeForCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Stringify any value for display
 */
function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ""
  }
  if (typeof value === "object") {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Truncate long values
 */
function truncateValue(value: string, maxLength: number = 200): string {
  if (value.length > maxLength) {
    return value.substring(0, maxLength) + "..."
  }
  return value
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Get available report formats
 */
export function getAvailableFormats(): ReportFormat[] {
  return ["json", "csv", "markdown"]
}

/**
 * Get MIME type for format
 */
export function getMimeTypeForFormat(format: ReportFormat): string {
  const mimeTypes: Record<ReportFormat, string> = {
    json: "application/json",
    csv: "text/csv",
    markdown: "text/markdown",
  }
  return mimeTypes[format] || "application/octet-stream"
}

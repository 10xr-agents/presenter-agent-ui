/**
 * Browser Automation Service API Client
 * 
 * Client for interacting with the Browser Automation Service's knowledge retrieval APIs.
 * See docs/openapi.yaml and docs/PROTOCOL_AND_INTERFACE.md for API documentation.
 */

import { env } from "@/env.mjs"

const DEFAULT_BASE_URL = "http://localhost:8000"

function getBaseUrl(): string {
  return env.BROWSER_AUTOMATION_SERVICE_URL || DEFAULT_BASE_URL
}

export interface StartExplorationRequest {
  start_url: string
  max_pages?: number
  max_depth?: number
  strategy?: "BFS" | "DFS"
  job_id?: string
  include_paths?: string[] // e.g., ["/docs/*"]
  exclude_paths?: string[] // e.g., ["/admin/*", "/api/*"]
}

export interface StartExplorationResponse {
  job_id: string
  status: "queued" | "running"
  message: string
}

export interface RecentPage {
  url: string
  title: string
  completed_at: string
}

export interface JobStatusResponse {
  job_id: string
  status: "idle" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled" | "cancelling"
  progress: {
    completed: number
    queued: number
    failed: number
    current_url: string | null
    estimated_time_remaining?: number // seconds
    processing_rate?: number // pages per minute
    recent_pages?: RecentPage[] // last 10 completed pages
  }
  started_at: string | null
  updated_at: string | null
}

export interface JobControlRequest {
  job_id: string
  wait_for_current_page?: boolean // For cancellation - wait for current page to complete
}

export interface JobControlResponse {
  job_id: string
  status: "paused" | "resumed" | "cancelled"
}

export type ErrorType = "network" | "timeout" | "http_4xx" | "http_5xx" | "parsing" | "other"

export interface ExplorationError {
  url: string
  error: string
  error_type?: ErrorType
  retry_count?: number
  last_attempted_at?: string
}

export interface JobResultsResponse {
  job_id: string
  status: "running" | "completed" | "failed" | "cancelled"
  results: {
    pages_stored: number
    links_stored: number
    external_links_detected: number
    errors: ExplorationError[]
  }
  website_metadata?: {
    title?: string
    description?: string
  }
  pages?: Array<{
    url: string
    title: string
    content: string
    metadata?: Record<string, unknown>
  }>
  links?: Array<{
    from: string
    to: string
    type: "internal" | "external"
    text?: string | null
  }>
}

export interface JobSummary {
  job_id: string
  status: "idle" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled"
  start_url: string
  started_at: string | null
}

export interface JobsListResponse {
  jobs: JobSummary[]
}

export interface ErrorResponse {
  error: string
  detail?: string
}

/**
 * Start a knowledge exploration job
 */
export async function startExploration(
  request: StartExplorationRequest
): Promise<StartExplorationResponse> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/knowledge/explore/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    throw new Error(error.error || error.detail || "Failed to start exploration")
  }

  return (await response.json()) as StartExplorationResponse
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/knowledge/explore/status/${jobId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    throw new Error(error.error || error.detail || "Failed to get job status")
  }

  return (await response.json()) as JobStatusResponse
}

/**
 * Pause a running job
 */
export async function pauseJob(jobId: string): Promise<JobControlResponse> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/knowledge/explore/pause`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job_id: jobId }),
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    throw new Error(error.error || error.detail || "Failed to pause job")
  }

  return (await response.json()) as JobControlResponse
}

/**
 * Resume a paused job
 */
export async function resumeJob(jobId: string): Promise<JobControlResponse> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/knowledge/explore/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job_id: jobId }),
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    throw new Error(error.error || error.detail || "Failed to resume job")
  }

  return (await response.json()) as JobControlResponse
}

/**
 * Cancel a job
 */
export async function cancelJob(
  jobId: string,
  waitForCurrentPage: boolean = false
): Promise<JobControlResponse> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/knowledge/explore/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      job_id: jobId,
      wait_for_current_page: waitForCurrentPage,
    }),
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    throw new Error(error.error || error.detail || "Failed to cancel job")
  }

  return (await response.json()) as JobControlResponse
}

/**
 * Get job results (partial or final)
 */
export async function getJobResults(
  jobId: string,
  partial: boolean = false
): Promise<JobResultsResponse> {
  const baseUrl = getBaseUrl()
  const url = new URL(`${baseUrl}/api/knowledge/explore/results/${jobId}`)
  url.searchParams.set("partial", partial.toString())

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    throw new Error(error.error || error.detail || "Failed to get job results")
  }

  return (await response.json()) as JobResultsResponse
}

/**
 * List all jobs
 */
export async function listJobs(): Promise<JobsListResponse> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/knowledge/explore/jobs`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    throw new Error(error.error || error.detail || "Failed to list jobs")
  }

  return (await response.json()) as JobsListResponse
}

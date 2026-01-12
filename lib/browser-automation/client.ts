/**
 * Browser Automation Service API Client
 * 
 * Client for interacting with the Browser Automation Service's knowledge retrieval APIs.
 * See docs/openapi.yaml and docs/PROTOCOL_AND_INTERFACE.md for API documentation.
 */

import * as Sentry from "@sentry/nextjs"
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
  authentication?: {
    username: string
    password: string
  }
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
  
  console.log("[Browser Automation] Starting exploration", {
    baseUrl,
    startUrl: request.start_url,
    maxPages: request.max_pages,
    maxDepth: request.max_depth,
    strategy: request.strategy,
    includePaths: request.include_paths,
    excludePaths: request.exclude_paths,
    hasAuthentication: !!request.authentication,
  })

  try {
    const response = await fetch(`${baseUrl}/api/knowledge/explore/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse
      const errorMessage = error.error || error.detail || "Failed to start exploration"
      
      console.error("[Browser Automation] Service error starting exploration", {
        baseUrl,
        startUrl: request.start_url,
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        errorDetail: error.detail,
      })
      
      Sentry.captureException(new Error(errorMessage), {
        tags: {
          operation: "start_exploration",
          service: "browser_automation",
          httpStatus: response.status,
        },
        extra: {
          baseUrl,
          request,
          errorResponse: error,
        },
      })
      
      throw new Error(errorMessage)
    }

    const result = (await response.json()) as StartExplorationResponse
    
    console.log("[Browser Automation] Exploration started", {
      jobId: result.job_id,
      status: result.status,
      startUrl: request.start_url,
    })

    return result
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Failed to start exploration")) {
      throw error
    }
    
    console.error("[Browser Automation] Network error starting exploration", {
      baseUrl,
      startUrl: request.start_url,
      error: error instanceof Error ? error.message : String(error),
    })
    
    Sentry.captureException(error, {
      tags: {
        operation: "start_exploration",
        service: "browser_automation",
        errorType: "network",
      },
      extra: {
        baseUrl,
        request,
      },
    })
    
    throw error
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const baseUrl = getBaseUrl()
  
  try {
    const response = await fetch(`${baseUrl}/api/knowledge/explore/status/${jobId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      let errorMessage = "Failed to get job status"
      let errorDetail: unknown = null
      const isNotFound = response.status === 404
      
      try {
        const error = (await response.json()) as ErrorResponse
        errorMessage = error.error || error.detail || errorMessage
        errorDetail = error
      } catch {
        // If response is not JSON, try to get text
        try {
          const text = await response.text()
          errorDetail = text
          if (text) {
            errorMessage = text.substring(0, 200) // Limit length
          }
        } catch {
          // If we can't read response, use status text
          errorMessage = response.statusText || errorMessage
        }
      }
      
      console.error("[Browser Automation] Service error getting job status", {
        baseUrl,
        jobId,
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        errorDetail,
        isNotFound,
      })
      
      // Create error with status code for better handling upstream
      const error = new Error(errorMessage) as Error & { statusCode?: number; isNotFound?: boolean }
      error.statusCode = response.status
      error.isNotFound = isNotFound
      throw error
    }

    let result: unknown
    try {
      const responseText = await response.text()
      console.log("[Browser Automation] Raw response from service", {
        baseUrl,
        jobId,
        status: response.status,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500),
      })
      
      result = JSON.parse(responseText) as unknown
    } catch (parseError: unknown) {
      console.error("[Browser Automation] Failed to parse job status response as JSON", {
        baseUrl,
        jobId,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        responseStatus: response.status,
        responseStatusText: response.statusText,
      })
      throw new Error("Invalid JSON response from browser automation service")
    }
    
    // Validate response structure
    if (!result || typeof result !== "object") {
      console.error("[Browser Automation] Invalid job status response structure", {
        baseUrl,
        jobId,
        responseType: typeof result,
        response: result,
      })
      throw new Error("Invalid response format from browser automation service")
    }

    const jobStatus = result as Partial<JobStatusResponse>
    
    // Log the actual response structure for debugging
    console.log("[Browser Automation] Parsed response structure", {
      baseUrl,
      jobId,
      hasJobId: "job_id" in jobStatus,
      hasStatus: "status" in jobStatus,
      hasProgress: "progress" in jobStatus,
      progressType: typeof jobStatus.progress,
      keys: Object.keys(jobStatus),
    })
    
    // Validate required fields
    if (!jobStatus.job_id || !jobStatus.status) {
      console.error("[Browser Automation] Job status response missing required fields", {
        baseUrl,
        jobId,
        hasJobId: !!jobStatus.job_id,
        hasStatus: !!jobStatus.status,
        response: result,
      })
      throw new Error("Job status response missing required fields (job_id, status)")
    }
    
    // Ensure progress object exists with defaults
    if (!jobStatus.progress || typeof jobStatus.progress !== "object") {
      console.warn("[Browser Automation] Job status missing or invalid progress field, using defaults", {
        baseUrl,
        jobId,
        status: jobStatus.status,
        progressType: typeof jobStatus.progress,
        response: result,
      })
      jobStatus.progress = {
        completed: 0,
        queued: 0,
        failed: 0,
        current_url: null,
      }
    }
    
    // Ensure all progress fields have defaults
    const safeProgress = {
      completed: jobStatus.progress.completed ?? 0,
      queued: jobStatus.progress.queued ?? 0,
      failed: jobStatus.progress.failed ?? 0,
      current_url: jobStatus.progress.current_url ?? null,
      estimated_time_remaining: jobStatus.progress.estimated_time_remaining,
      processing_rate: jobStatus.progress.processing_rate,
      recent_pages: jobStatus.progress.recent_pages,
    }
    
    console.log("[Browser Automation] Job status retrieved", {
      jobId,
      status: jobStatus.status,
      progress: safeProgress,
    })

    // Return properly typed response with safe progress
    return {
      job_id: jobStatus.job_id,
      status: jobStatus.status,
      progress: safeProgress,
      started_at: jobStatus.started_at ?? null,
      updated_at: jobStatus.updated_at ?? null,
    } as JobStatusResponse
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Don't log and re-throw if it's already a known error we created
    if (error instanceof Error && error.message.includes("Failed to get job status")) {
      throw error
    }
    
    console.error("[Browser Automation] Error getting job status", {
      baseUrl,
      jobId,
      error: errorMessage,
    })
    
    throw error
  }
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

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse
      const errorMessage = error.error || error.detail || "Failed to get job results"
      
      console.error("[Browser Automation] Service error getting job results", {
        baseUrl,
        jobId,
        partial,
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
      })
      
      throw new Error(errorMessage)
    }

    const result = (await response.json()) as JobResultsResponse
    
    console.log("[Browser Automation] Job results retrieved", {
      jobId,
      status: result.status,
      pagesStored: result.results.pages_stored,
      linksStored: result.results.links_stored,
      externalLinksDetected: result.results.external_links_detected,
      errorCount: result.results.errors.length,
      partial,
    })

    // Log errors if any
    if (result.results.errors.length > 0) {
      console.warn("[Browser Automation] Job completed with errors", {
        jobId,
        errorCount: result.results.errors.length,
        errors: result.results.errors.map((e) => ({
          url: e.url,
          errorType: e.error_type,
          retryCount: e.retry_count,
        })),
      })
    }

    return result
  } catch (error: unknown) {
    console.error("[Browser Automation] Error getting job results", {
      baseUrl,
      jobId,
      partial,
      error: error instanceof Error ? error.message : String(error),
    })
    
    throw error
  }
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

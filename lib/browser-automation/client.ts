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
      let errorData: unknown
      try {
        errorData = await response.json()
      } catch {
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
      }
      
      // Handle Pydantic validation errors (422) - error is an array
      let errorMessage = "Failed to start exploration"
      if (Array.isArray(errorData)) {
        // Pydantic validation errors format: [{ type, loc, msg, input }]
        const validationErrors = errorData.map((err: unknown) => {
          const e = err as { loc?: unknown[]; msg?: string }
          const fieldPath = Array.isArray(e.loc) ? e.loc.join(".") : "unknown"
          return `${fieldPath}: ${e.msg || "Field required"}`
        })
        errorMessage = `Validation error: ${validationErrors.join(", ")}`
      } else if (typeof errorData === "object" && errorData !== null) {
        const err = errorData as { error?: string; detail?: string | unknown[] }
        if (Array.isArray(err.detail)) {
          // Handle FastAPI validation errors in detail field
          const validationErrors = err.detail.map((e: unknown) => {
            const errorItem = e as { loc?: unknown[]; msg?: string }
            const fieldPath = Array.isArray(errorItem.loc) ? errorItem.loc.join(".") : "unknown"
            return `${fieldPath}: ${errorItem.msg || "Field required"}`
          })
          errorMessage = `Validation error: ${validationErrors.join(", ")}`
        } else {
          errorMessage = err.error || (typeof err.detail === "string" ? err.detail : errorMessage)
        }
      }
      
      console.error("[Browser Automation] Service error starting exploration", {
        baseUrl,
        startUrl: request.start_url,
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        errorDetail: errorData,
        requestBody: {
          ...request,
          authentication: request.authentication ? { username: request.authentication.username, password: "***" } : undefined,
        },
      })
      
      Sentry.captureException(new Error(errorMessage), {
        tags: {
          operation: "start_exploration",
          service: "browser_automation",
          httpStatus: response.status,
        },
        extra: {
          baseUrl,
          request: {
            ...request,
            authentication: request.authentication ? { username: request.authentication.username, password: "***" } : undefined,
          },
          errorResponse: errorData,
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

    const finalStatus: JobStatusResponse = {
      job_id: jobStatus.job_id,
      status: jobStatus.status,
      progress: safeProgress,
      started_at: jobStatus.started_at ?? null,
      updated_at: jobStatus.updated_at ?? null,
    }

    // CRITICAL: Validate job status structure
    const { validateJobStatus } = await import("./validation")
    try {
      validateJobStatus(finalStatus, jobId)
    } catch (validationError: unknown) {
      // Validation throws on critical failures - log but don't fail status fetch
      console.error("[Browser Automation] Job status validation failed (non-fatal)", {
        jobId,
        validationError: validationError instanceof Error ? validationError.message : String(validationError),
      })
    }

    return finalStatus
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
    const errorMessage = error.error || error.detail || "Failed to pause job"
    const errorWithStatus = new Error(errorMessage) as Error & { statusCode?: number; isNotFound?: boolean }
    errorWithStatus.statusCode = response.status
    errorWithStatus.isNotFound = response.status === 404
    throw errorWithStatus
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
    const errorMessage = error.error || error.detail || "Failed to cancel job"
    const errorWithStatus = new Error(errorMessage) as Error & { statusCode?: number; isNotFound?: boolean }
    errorWithStatus.statusCode = response.status
    errorWithStatus.isNotFound = response.status === 404
    throw errorWithStatus
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

    let result: unknown
    try {
      const responseText = await response.text()
      console.log("[Browser Automation] Raw job results response", {
        jobId,
        status: response.status,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500),
      })
      
      result = JSON.parse(responseText) as unknown
    } catch (parseError: unknown) {
      const error = "Failed to parse job results response as JSON"
      console.error("[Browser Automation] CRITICAL FAILURE - Invalid JSON response", {
        jobId,
        partial,
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
        responseStatus: response.status,
        responseStatusText: response.statusText,
      })
      Sentry.captureException(parseError, {
        tags: {
          operation: "get_job_results",
          jobId,
          failure_type: "json_parse_error",
        },
        extra: {
          jobId,
          partial,
          responseStatus: response.status,
        },
      })
      throw new Error(error)
    }

    // CRITICAL: Validate response structure
    if (!result || typeof result !== "object") {
      const error = "Job results response is not an object"
      console.error("[Browser Automation] CRITICAL FAILURE - Invalid response structure", {
        jobId,
        partial,
        responseType: typeof result,
        response: result,
      })
      Sentry.captureMessage("Browser automation job results invalid structure", {
        level: "error",
        tags: {
          operation: "get_job_results",
          jobId,
          failure_type: "invalid_structure",
        },
        extra: {
          jobId,
          partial,
          responseType: typeof result,
        },
      })
      throw new Error(error)
    }

    const jobResults = result as Partial<JobResultsResponse>

    // CRITICAL: Validate required fields
    if (!jobResults.job_id || !jobResults.status || !jobResults.results) {
      const error = "Job results response missing required fields (job_id, status, or results)"
      console.error("[Browser Automation] CRITICAL FAILURE - Missing required fields", {
        jobId,
        partial,
        hasJobId: !!jobResults.job_id,
        hasStatus: !!jobResults.status,
        hasResults: !!jobResults.results,
        responseKeys: Object.keys(jobResults),
      })
      Sentry.captureMessage("Browser automation job results missing required fields", {
        level: "error",
        tags: {
          operation: "get_job_results",
          jobId,
          failure_type: "missing_required_fields",
        },
        extra: {
          jobId,
          partial,
          hasJobId: !!jobResults.job_id,
          hasStatus: !!jobResults.status,
          hasResults: !!jobResults.results,
          responseKeys: Object.keys(jobResults),
        },
      })
      throw new Error(error)
    }

    // Ensure results object has required fields with defaults
    const safeResults = {
      pages_stored: typeof jobResults.results.pages_stored === "number" ? jobResults.results.pages_stored : 0,
      links_stored: typeof jobResults.results.links_stored === "number" ? jobResults.results.links_stored : 0,
      external_links_detected: typeof jobResults.results.external_links_detected === "number" 
        ? jobResults.results.external_links_detected 
        : 0,
      errors: Array.isArray(jobResults.results.errors) ? jobResults.results.errors : [],
    }

    const finalResult: JobResultsResponse = {
      job_id: jobResults.job_id,
      status: jobResults.status,
      results: safeResults,
      pages: Array.isArray(jobResults.pages) ? jobResults.pages : undefined,
      links: Array.isArray(jobResults.links) ? jobResults.links : undefined,
      website_metadata: jobResults.website_metadata,
    }
    
    console.log("[Browser Automation] Job results retrieved and validated", {
      jobId,
      status: finalResult.status,
      pagesStored: finalResult.results.pages_stored,
      linksStored: finalResult.results.links_stored,
      externalLinksDetected: finalResult.results.external_links_detected,
      errorCount: finalResult.results.errors.length,
      hasPagesArray: !!finalResult.pages,
      hasLinksArray: !!finalResult.links,
      pagesArrayLength: finalResult.pages?.length ?? 0,
      linksArrayLength: finalResult.links?.length ?? 0,
      partial,
    })

    // Log errors if any
    if (finalResult.results.errors.length > 0) {
      console.warn("[Browser Automation] Job completed with errors", {
        jobId,
        errorCount: finalResult.results.errors.length,
        errors: finalResult.results.errors.map((e) => ({
          url: e.url,
          errorType: e.error_type,
          retryCount: e.retry_count,
        })),
      })
    }

    // CRITICAL: Import and run validation
    const { validateJobResults } = await import("./validation")
    try {
      const validation = validateJobResults(finalResult, jobId)
      console.log("[Browser Automation] Job results validation passed", {
        jobId,
        isValid: validation.isValid,
        confidence: validation.confidence,
        extractedPages: validation.extractedPages,
        extractedLinks: validation.extractedLinks,
        hasUsableContent: validation.hasUsableContent,
        issueCount: validation.issues.length,
      })
    } catch (validationError: unknown) {
      // Validation throws on critical failures - re-throw to fail loudly
      console.error("[Browser Automation] CRITICAL FAILURE - Job results validation failed", {
        jobId,
        validationError: validationError instanceof Error ? validationError.message : String(validationError),
      })
      throw validationError
    }

    return finalResult
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

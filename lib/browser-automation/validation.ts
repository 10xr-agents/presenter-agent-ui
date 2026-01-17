/**
 * Browser Automation Response Validation
 * 
 * Strict validation for browser automation API responses to ensure
 * extracted knowledge is complete, structured, and traceable.
 * 
 * This module enforces contracts and fails loudly when data is missing or invalid.
 */

import * as Sentry from "@sentry/nextjs"
import type { JobResultsResponse, JobStatusResponse } from "./client"

/**
 * Validation result for knowledge extraction
 */
export interface KnowledgeValidationResult {
  isValid: boolean
  confidence: "high" | "medium" | "low" | "none"
  issues: string[]
  extractedPages: number
  extractedLinks: number
  hasUsableContent: boolean
}

/**
 * Validate that job results contain usable knowledge
 * 
 * This function ensures:
 * - Results exist and are not empty
 * - Pages contain actual content (not just URLs)
 * - DOM summaries or content are present and meaningful
 * - Links are valid and structured
 * 
 * @throws Error if results are fundamentally invalid (missing required data)
 */
export function validateJobResults(
  jobResults: JobResultsResponse,
  jobId: string
): KnowledgeValidationResult {
  const issues: string[] = []
  let extractedPages = 0
  let extractedLinks = 0
  let hasUsableContent = false

  console.log("[Browser Automation Validation] Starting validation", {
    jobId,
    status: jobResults.status,
    hasResults: !!jobResults.results,
    hasPages: !!jobResults.pages,
    hasLinks: !!jobResults.links,
    pagesStored: jobResults.results?.pages_stored ?? 0,
    linksStored: jobResults.results?.links_stored ?? 0,
  })

  // CRITICAL: Validate results object exists
  if (!jobResults.results) {
    const error = "Job results missing 'results' object - cannot validate knowledge extraction"
    console.error("[Browser Automation Validation] CRITICAL FAILURE", {
      jobId,
      error,
      responseStructure: Object.keys(jobResults),
    })
    Sentry.captureMessage("Browser automation results missing results object", {
      level: "error",
      tags: {
        operation: "validate_job_results",
        jobId,
        failure_type: "missing_results_object",
      },
      extra: {
        jobId,
        status: jobResults.status,
        responseKeys: Object.keys(jobResults),
      },
    })
    throw new Error(error)
  }

  const results = jobResults.results

  // Validate pages_stored is a number
  if (typeof results.pages_stored !== "number") {
    issues.push(`pages_stored is not a number: ${typeof results.pages_stored}`)
  } else {
    extractedPages = results.pages_stored
  }

  // Validate links_stored is a number
  if (typeof results.links_stored !== "number") {
    issues.push(`links_stored is not a number: ${typeof results.links_stored}`)
  } else {
    extractedLinks = results.links_stored
  }

  // CRITICAL: If job is completed, we MUST have extracted pages or links
  if (jobResults.status === "completed") {
    if (extractedPages === 0 && extractedLinks === 0) {
      const error = "Job marked as completed but extracted zero pages and zero links - no knowledge was extracted"
      console.error("[Browser Automation Validation] CRITICAL FAILURE", {
        jobId,
        error,
        pagesStored: extractedPages,
        linksStored: extractedLinks,
      })
      Sentry.captureMessage("Browser automation job completed with zero extracted knowledge", {
        level: "error",
        tags: {
          operation: "validate_job_results",
          jobId,
          failure_type: "zero_knowledge_extracted",
        },
        extra: {
          jobId,
          status: jobResults.status,
          pagesStored: extractedPages,
          linksStored: extractedLinks,
          errorCount: results.errors?.length ?? 0,
        },
      })
      throw new Error(error)
    }
  }

  // Validate pages array if present
  if (jobResults.pages) {
    if (!Array.isArray(jobResults.pages)) {
      issues.push("pages is not an array")
    } else {
      // Validate each page has required fields
      jobResults.pages.forEach((page, index) => {
        if (!page.url) {
          issues.push(`Page ${index} missing URL`)
        }
        if (!page.title && !page.content) {
          issues.push(`Page ${index} (${page.url}) missing both title and content - no usable knowledge`)
        }
        if (page.content) {
          const contentLength = typeof page.content === "string" ? page.content.length : 0
          if (contentLength === 0) {
            issues.push(`Page ${index} (${page.url}) has empty content`)
          } else if (contentLength < 10) {
            issues.push(`Page ${index} (${page.url}) has suspiciously short content (${contentLength} chars)`)
          } else {
            hasUsableContent = true
            console.log("[Browser Automation Validation] Page has usable content", {
              jobId,
              pageIndex: index,
              url: page.url,
              contentLength,
              title: page.title,
            })
          }
        } else {
          issues.push(`Page ${index} (${page.url}) missing content field - cannot extract knowledge`)
        }
      })

      // Log summary of pages
      const pagesWithContent = jobResults.pages.filter((p) => p.content && p.content.length > 0).length
      const pagesWithTitle = jobResults.pages.filter((p) => p.title && p.title.length > 0).length
      
      console.log("[Browser Automation Validation] Pages validation summary", {
        jobId,
        totalPages: jobResults.pages.length,
        pagesWithContent,
        pagesWithTitle,
        pagesWithUsableContent: jobResults.pages.filter((p) => 
          p.content && typeof p.content === "string" && p.content.length >= 10
        ).length,
      })

      if (pagesWithContent === 0 && jobResults.pages.length > 0) {
        const error = `All ${jobResults.pages.length} pages are missing content - no usable knowledge extracted`
        console.error("[Browser Automation Validation] CRITICAL FAILURE", {
          jobId,
          error,
          totalPages: jobResults.pages.length,
        })
        Sentry.captureMessage("All browser automation pages missing content", {
          level: "error",
          tags: {
            operation: "validate_job_results",
            jobId,
            failure_type: "pages_missing_content",
          },
          extra: {
            jobId,
            totalPages: jobResults.pages.length,
            pagesStored: extractedPages,
          },
        })
        throw new Error(error)
      }
    }
  } else if (extractedPages > 0) {
    // If pages_stored > 0 but pages array is missing, that's suspicious
    issues.push(`pages_stored is ${extractedPages} but pages array is missing - cannot verify extracted content`)
    console.warn("[Browser Automation Validation] Missing pages array", {
      jobId,
      pagesStored: extractedPages,
      hasPagesArray: !!jobResults.pages,
    })
  }

  // Validate links array if present
  if (jobResults.links) {
    if (!Array.isArray(jobResults.links)) {
      issues.push("links is not an array")
    } else {
      // Validate each link has required fields
      jobResults.links.forEach((link, index) => {
        if (!link.from) {
          issues.push(`Link ${index} missing 'from' URL`)
        }
        if (!link.to) {
          issues.push(`Link ${index} missing 'to' URL`)
        }
        if (!link.type) {
          issues.push(`Link ${index} missing type (internal/external)`)
        }
      })

      console.log("[Browser Automation Validation] Links validation summary", {
        jobId,
        totalLinks: jobResults.links.length,
        internalLinks: jobResults.links.filter((l) => l.type === "internal").length,
        externalLinks: jobResults.links.filter((l) => l.type === "external").length,
      })
    }
  } else if (extractedLinks > 0) {
    // If links_stored > 0 but links array is missing, that's suspicious
    issues.push(`links_stored is ${extractedLinks} but links array is missing - cannot verify extracted links`)
    console.warn("[Browser Automation Validation] Missing links array", {
      jobId,
      linksStored: extractedLinks,
      hasLinksArray: !!jobResults.links,
    })
  }

  // Validate errors array
  if (results.errors) {
    if (!Array.isArray(results.errors)) {
      issues.push("errors is not an array")
    } else {
      const errorCount = results.errors.length
      if (errorCount > 0) {
        console.warn("[Browser Automation Validation] Job completed with errors", {
          jobId,
          errorCount,
          errors: results.errors.map((e) => ({
            url: e.url,
            errorType: e.error_type,
            retryCount: e.retry_count,
          })),
        })
      }
    }
  }

  // Determine confidence level
  let confidence: "high" | "medium" | "low" | "none" = "none"
  if (hasUsableContent && extractedPages > 0) {
    if (extractedPages >= 5 && issues.length === 0) {
      confidence = "high"
    } else if (extractedPages >= 2 && issues.length <= 2) {
      confidence = "medium"
    } else {
      confidence = "low"
    }
  } else if (extractedLinks > 0 && extractedPages === 0) {
    confidence = "low" // Links only, no page content
  }

  const isValid = issues.length === 0 && (extractedPages > 0 || extractedLinks > 0)

  console.log("[Browser Automation Validation] Validation complete", {
    jobId,
    isValid,
    confidence,
    extractedPages,
    extractedLinks,
    hasUsableContent,
    issueCount: issues.length,
    issues: issues.slice(0, 5), // Log first 5 issues
  })

  return {
    isValid,
    confidence,
    issues,
    extractedPages,
    extractedLinks,
    hasUsableContent,
  }
}

/**
 * Validate job status response
 * 
 * Ensures status response has required fields and valid structure.
 */
export function validateJobStatus(
  jobStatus: JobStatusResponse,
  jobId: string
): void {
  console.log("[Browser Automation Validation] Validating job status", {
    jobId,
    hasJobId: !!jobStatus.job_id,
    hasStatus: !!jobStatus.status,
    hasProgress: !!jobStatus.progress,
  })

  if (!jobStatus.job_id) {
    const error = "Job status response missing job_id"
    console.error("[Browser Automation Validation] CRITICAL FAILURE", {
      jobId,
      error,
      response: jobStatus,
    })
    throw new Error(error)
  }

  if (!jobStatus.status) {
    const error = "Job status response missing status"
    console.error("[Browser Automation Validation] CRITICAL FAILURE", {
      jobId,
      error,
      response: jobStatus,
    })
    throw new Error(error)
  }

  if (!jobStatus.progress) {
    console.warn("[Browser Automation Validation] Job status missing progress object", {
      jobId,
      status: jobStatus.status,
    })
    // Progress is optional for some statuses, but log it
  } else {
    // Validate progress structure
    const progress = jobStatus.progress
    if (typeof progress.completed !== "number") {
      console.warn("[Browser Automation Validation] Progress.completed is not a number", {
        jobId,
        type: typeof progress.completed,
      })
    }
    if (typeof progress.queued !== "number") {
      console.warn("[Browser Automation Validation] Progress.queued is not a number", {
        jobId,
        type: typeof progress.queued,
      })
    }
    if (typeof progress.failed !== "number") {
      console.warn("[Browser Automation Validation] Progress.failed is not a number", {
        jobId,
        type: typeof progress.failed,
      })
    }
  }

  console.log("[Browser Automation Validation] Job status validation complete", {
    jobId,
    status: jobStatus.status,
    progress: jobStatus.progress ? {
      completed: jobStatus.progress.completed,
      queued: jobStatus.progress.queued,
      failed: jobStatus.progress.failed,
      currentUrl: jobStatus.progress.current_url,
    } : null,
  })
}

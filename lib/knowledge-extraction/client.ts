/**
 * Knowledge Extraction API Client
 * 
 * Client for interacting with the Knowledge Extraction Service API
 * Supports ingestion from URLs (documentation, website, video) and file uploads
 */

export type SourceType = "documentation" | "website" | "video"
export type WorkflowStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export interface IngestionStartRequest {
  source_type: SourceType
  source_url: string
  source_name?: string
  options?: {
    max_pages?: number // website only
    max_depth?: number // website only
    extract_code_blocks?: boolean // documentation only
    extract_thumbnails?: boolean // video only
  }
  job_id?: string
}

export interface IngestionStartResponse {
  job_id: string
  workflow_id: string
  status: "queued"
  estimated_duration_seconds: number
  message: string
}

export interface IngestionUploadRequest {
  source_type: "documentation" | "video"
  source_name: string
  file: File
  job_id?: string
}

export interface IngestionUploadResponse {
  job_id: string
  workflow_id: string
  status: "queued"
  estimated_duration_seconds: number
  message: string
}

export interface WorkflowStatusResponse {
  job_id: string
  workflow_id: string
  status: WorkflowStatus
  phase: string
  progress: number // 0-100
  errors: string[]
  warnings: string[]
  checkpoints: Array<{
    activity_name: string
    checkpoint_id: number
    items_processed: number
    total_items: number
    progress_percentage: number
  }>
  created_at: string
  updated_at: string
  metadata: {
    source_type: string
    source_url?: string
    estimated_completion?: string
  }
}

export interface ErrorResponse {
  error?: string
  detail?: string
  code?: string
  message?: string
}

function getBaseUrl(): string {
  // Use environment variable or default to localhost
  return process.env.NEXT_PUBLIC_KNOWLEDGE_EXTRACTION_API_URL || 
         process.env.KNOWLEDGE_EXTRACTION_API_URL || 
         "http://localhost:8000"
}

/**
 * Start knowledge extraction from a URL
 */
export async function startIngestion(
  request: IngestionStartRequest
): Promise<IngestionStartResponse> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/knowledge/ingest/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    const errorMessage = error.error || error.detail || error.message || "Failed to start ingestion"
    throw new Error(errorMessage)
  }

  return (await response.json()) as IngestionStartResponse
}

/**
 * Upload a file for knowledge extraction
 */
export async function uploadIngestion(
  request: IngestionUploadRequest
): Promise<IngestionUploadResponse> {
  const baseUrl = getBaseUrl()
  const formData = new FormData()
  formData.append("source_type", request.source_type)
  formData.append("source_name", request.source_name)
  formData.append("file", request.file)
  if (request.job_id) {
    formData.append("job_id", request.job_id)
  }

  const response = await fetch(`${baseUrl}/api/knowledge/ingest/upload`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    const errorMessage = error.error || error.detail || error.message || "Failed to upload file"
    throw new Error(errorMessage)
  }

  return (await response.json()) as IngestionUploadResponse
}

/**
 * Get workflow status
 */
export async function getWorkflowStatus(jobId: string): Promise<WorkflowStatusResponse> {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/api/knowledge/workflows/status/${jobId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    const errorMessage = error.error || error.detail || error.message || "Failed to get workflow status"
    throw new Error(errorMessage)
  }

  return (await response.json()) as WorkflowStatusResponse
}

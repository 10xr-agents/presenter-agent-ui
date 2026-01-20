/**
 * Knowledge Extraction API Client
 * 
 * Client for interacting with the Knowledge Extraction Service API
 * Supports ingestion from URLs (documentation, website, video) and file uploads
 */

export type SourceType = "documentation" | "website" | "video" | "file" | "live_navigation"
export type WorkflowStatus = "queued" | "running" | "completed" | "failed" | "cancelled"

export interface S3Reference {
  bucket: string
  key: string
  region?: string
  endpoint?: string
  presigned_url: string // Presigned URL for downloading (required in new schema)
  expires_at: string // Expiry time for presigned URL (required in new schema)
}

export interface FileMetadata {
  filename: string
  size: number
  content_type: string
  uploaded_at: string
}

/**
 * New two-phase knowledge extraction request structure:
 * 
 * Phase 1: Extract knowledge from files or documentation URLs
 * - Process uploaded files (video, audio, txt, md, docx, pdf, etc.) OR
 * - Process publicly available documentation URLs for crawling
 * 
 * Phase 2: DOM-level analysis on website with authentication
 * - Use website_url + credentials to perform authenticated DOM analysis
 * - Extract additional knowledge through browser-based interaction
 */
export interface IngestionStartRequest {
  // Required per OpenAPI schema: Target website/webportal for Phase 2 DOM analysis
  website_url: string
  
  // Optional: Human-readable website name
  website_name?: string
  
  // Phase 1: Files to process (videos, audio, txt, md, docx, pdf, etc.)
  s3_references?: S3Reference[] | null
  file_metadata_list?: FileMetadata[] | null // Must match s3_references length if provided
  
  // Phase 1: Documentation URLs for crawling
  documentation_urls?: string[] | null
  
  // Credentials for website login (Phase 2)
  credentials?: {
    username: string
    password: string
    login_url?: string // Optional login URL (auto-detected if not provided)
  } | null
  
  // Extraction options
  options?: {
    max_pages?: number
    max_depth?: number
    extract_code_blocks?: boolean
    extract_thumbnails?: boolean
  } | null
  
  // Knowledge ID for persisting and querying extracted knowledge
  knowledge_id?: string | null
  
  // Job ID (auto-generated if not provided)
  job_id?: string | null
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
  knowledge_id?: string // Knowledge ID for persisting extracted knowledge against this ID
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

export interface KnowledgeQueryResponse {
  knowledge_id: string
  job_id: string
  screens?: unknown[]
  tasks?: unknown[]
  actions?: unknown[]
  transitions?: unknown[]
  business_functions?: unknown[]
  workflows?: unknown[]
  statistics?: {
    screens_count?: number
    tasks_count?: number
    actions_count?: number
    transitions_count?: number
    business_functions_count?: number
    workflows_count?: number
    total_entities?: number
  }
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
  
  // Log request details (excluding sensitive data like passwords)
  console.log("[Knowledge Extraction Client] Sending two-phase ingestion request", {
    website_url: request.website_url,
    website_name: request.website_name,
    knowledge_id: request.knowledge_id,
    has_s3_references: !!request.s3_references && request.s3_references.length > 0,
    has_documentation_urls: !!request.documentation_urls && request.documentation_urls.length > 0,
    has_credentials: !!request.credentials,
    file_count: request.s3_references?.length || request.file_metadata_list?.length || 0,
    documentation_url_count: request.documentation_urls?.length || 0,
    s3_references_details: request.s3_references ? request.s3_references.map(ref => ({
      bucket: ref.bucket,
      key: ref.key,
      region: ref.region,
      has_presigned_url: !!ref.presigned_url,
    })) : undefined,
    file_metadata_details: request.file_metadata_list ? request.file_metadata_list.map(m => ({
      filename: m.filename,
      size: m.size,
      content_type: m.content_type,
    })) : undefined,
    job_id: request.job_id,
    endpoint: `${baseUrl}/api/knowledge/ingest/start`,
  })

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
  if (request.knowledge_id) {
    formData.append("knowledge_id", request.knowledge_id)
  }
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
  
  try {
    const response = await fetch(`${baseUrl}/api/knowledge/workflows/status/${jobId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      let errorMessage = "Failed to get workflow status"
      let errorDetail: unknown = null
      
      try {
        const error = (await response.json()) as ErrorResponse
        errorMessage = error.error || error.detail || error.message || errorMessage
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
      
      // Create error with status code for better handling upstream
      const error = new Error(errorMessage) as Error & { statusCode?: number; isNotFound?: boolean }
      error.statusCode = response.status
      error.isNotFound = response.status === 404
      throw error
    }

    let result: unknown
    try {
      result = await response.json()
    } catch (parseError: unknown) {
      const parseErrorMessage = parseError instanceof Error ? parseError.message : String(parseError)
      throw new Error(`Failed to parse workflow status response: ${parseErrorMessage}`)
    }

    return result as WorkflowStatusResponse
  } catch (error: unknown) {
    // Re-throw if it's already an Error we created
    const errorWithStatus = error as Error & { statusCode?: number; isNotFound?: boolean }
    if (error instanceof Error && (errorWithStatus.statusCode !== undefined || errorWithStatus.isNotFound !== undefined)) {
      throw error
    }
    
    // Handle network errors and other fetch failures
    const errorMessage = error instanceof Error ? error.message : String(error)
    const networkError = new Error(`Network error fetching workflow status: ${errorMessage}`) as Error & { 
      statusCode?: number
      isNetworkError?: boolean
    }
    networkError.statusCode = 0
    networkError.isNetworkError = true
    throw networkError
  }
}

/**
 * Query knowledge by knowledge_id
 * 
 * If job_id is provided, returns knowledge for that specific job (historical view).
 * If job_id is not provided, returns latest knowledge (most recent job) for the knowledge_id.
 * 
 * This is the PRIMARY endpoint for querying extracted knowledge.
 */
export async function queryKnowledge(
  knowledgeId: string,
  jobId?: string | null
): Promise<KnowledgeQueryResponse> {
  const baseUrl = getBaseUrl()
  const queryParams = jobId ? `?job_id=${encodeURIComponent(jobId)}` : ""
  const url = `${baseUrl}/api/knowledge/query/${knowledgeId}${queryParams}`

  console.log("[Knowledge Extraction Client] Querying knowledge", {
    knowledgeId,
    jobId: jobId || "latest",
    url,
  })

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const error = (await response.json()) as ErrorResponse
    const errorMessage = error.error || error.detail || error.message || "Failed to query knowledge"
    
    // Create error with status code for better handling upstream
    const fetchError = new Error(errorMessage) as Error & { statusCode?: number; isNotFound?: boolean }
    fetchError.statusCode = response.status
    fetchError.isNotFound = response.status === 404
    throw fetchError
  }

  return (await response.json()) as KnowledgeQueryResponse
}

/**
 * S3 Client Utility
 * 
 * Supports both DigitalOcean Spaces (S3-compatible) and AWS S3
 * Uses lazy initialization pattern per RULESETS.md
 */

import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "@/env.mjs"

type S3Provider = "aws" | "digitalocean"

interface S3Config {
  provider: S3Provider
  region: string
  bucket: string
  endpoint?: string // Required for DigitalOcean Spaces
  accessKeyId?: string // Optional if using IAM roles
  secretAccessKey?: string // Optional if using IAM roles
}

interface S3Reference {
  bucket: string
  key: string
  region?: string
  endpoint?: string
  url?: string // Public URL if available
}

interface FileMetadata {
  originalFilename: string
  size: number
  contentType: string
  uploadedAt: Date
}

interface UploadResult {
  s3Reference: S3Reference
  fileMetadata: FileMetadata
  presignedUrl?: string // For downloading
  presignedUrlExpiresAt?: Date
}

let s3ClientInstance: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    // Determine provider: use NODE_ENV (development = digitalocean, production = aws)
    // Can be overridden with S3_PROVIDER if explicitly set
    const nodeEnv = process.env.NODE_ENV || "development"
    const provider = (env.S3_PROVIDER || (nodeEnv === "development" ? "digitalocean" : "aws")) as S3Provider
    const bucket = env.S3_BUCKET
    const endpoint = env.S3_ENDPOINT
    const accessKeyId = env.S3_ACCESS_KEY_ID
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY

    if (!bucket) {
      throw new Error("S3_BUCKET environment variable is required")
    }

    // For DigitalOcean Spaces, endpoint is required
    if (provider === "digitalocean" && !endpoint) {
      throw new Error("S3_ENDPOINT is required for DigitalOcean Spaces")
    }

    // Derive region from endpoint or use defaults
    let region: string
    if (env.S3_REGION) {
      // Explicitly set region takes precedence
      region = env.S3_REGION
    } else if (provider === "digitalocean" && endpoint) {
      // Extract region from DigitalOcean endpoint (e.g., nyc3 from https://nyc3.digitaloceanspaces.com)
      try {
        const url = new URL(endpoint)
        const hostname = url.hostname
        // DigitalOcean format: {region}.digitaloceanspaces.com
        const match = hostname.match(/^([^.]+)\.digitaloceanspaces\.com$/)
        region = match?.[1] || "nyc3" // Default to nyc3 if can't parse
      } catch {
        region = "nyc3" // Default fallback
      }
    } else {
      // AWS default region
      region = "us-east-1"
    }

    // For AWS, credentials can come from IAM roles (no need for access key/secret)
    // For DigitalOcean, credentials are required
    if (provider === "digitalocean" && (!accessKeyId || !secretAccessKey)) {
      throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for DigitalOcean Spaces")
    }

    const config: S3Config = {
      provider,
      region,
      bucket,
      endpoint,
      accessKeyId,
      secretAccessKey,
    }

    s3ClientInstance = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined, // Use IAM roles if credentials not provided
      forcePathStyle: config.provider === "digitalocean", // DigitalOcean requires path-style
    })
  }

  return s3ClientInstance
}

/**
 * Get S3 configuration
 */
export function getS3Config(): S3Config {
  // Determine provider: use NODE_ENV (development = digitalocean, production = aws)
  // Can be overridden with S3_PROVIDER if explicitly set
  const nodeEnv = process.env.NODE_ENV || "development"
  const provider = (env.S3_PROVIDER || (nodeEnv === "development" ? "digitalocean" : "aws")) as S3Provider
  const bucket = env.S3_BUCKET
  const endpoint = env.S3_ENDPOINT
  const accessKeyId = env.S3_ACCESS_KEY_ID
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY

  if (!bucket) {
    throw new Error("S3_BUCKET environment variable is required")
  }

  // Derive region from endpoint or use defaults
  let region: string
  if (env.S3_REGION) {
    // Explicitly set region takes precedence
    region = env.S3_REGION
  } else if (provider === "digitalocean" && endpoint) {
    // Extract region from DigitalOcean endpoint (e.g., nyc3 from https://nyc3.digitaloceanspaces.com)
    try {
      const url = new URL(endpoint)
      const hostname = url.hostname
      // DigitalOcean format: {region}.digitaloceanspaces.com
      const match = hostname.match(/^([^.]+)\.digitaloceanspaces\.com$/)
      region = match?.[1] || "nyc3" // Default to nyc3 if can't parse
    } catch {
      region = "nyc3" // Default fallback
    }
  } else {
    // AWS default region
    region = "us-east-1"
  }

  return {
    provider,
    region,
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
  }
}

/**
 * Upload a file to S3
 */
export async function uploadFileToS3(
  file: File | Buffer,
  key: string,
  contentType: string,
  metadata?: Record<string, string>
): Promise<UploadResult> {
  const client = getS3Client()
  const config = getS3Config()

  // Convert File to Buffer if needed
  let fileBuffer: Buffer
  if (file instanceof File) {
    const arrayBuffer = await file.arrayBuffer()
    fileBuffer = Buffer.from(arrayBuffer)
  } else {
    fileBuffer = file
  }

  const originalFilename = file instanceof File ? file.name : key.split("/").pop() || "unknown"

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
    Metadata: metadata || {},
  })

  await client.send(command)

  // Generate presigned URL for downloading (valid for 1 hour)
  const getObjectCommand = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  })

  const presignedUrl = await getSignedUrl(client, getObjectCommand, { expiresIn: 3600 })
  const presignedUrlExpiresAt = new Date(Date.now() + 3600 * 1000)

  // Construct public URL (if bucket is public)
  let publicUrl: string | undefined
  if (config.provider === "digitalocean" && config.endpoint) {
    // DigitalOcean Spaces public URL format
    const endpointUrl = new URL(config.endpoint)
    publicUrl = `${endpointUrl.protocol}//${config.bucket}.${endpointUrl.host}/${key}`
  } else if (config.provider === "aws") {
    // AWS S3 public URL format (if bucket is public)
    publicUrl = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`
  }

  const s3Reference: S3Reference = {
    bucket: config.bucket,
    key,
    region: config.region,
    endpoint: config.endpoint,
    url: publicUrl,
  }

  const fileMetadata: FileMetadata = {
    originalFilename,
    size: fileBuffer.length,
    contentType,
    uploadedAt: new Date(),
  }

  return {
    s3Reference,
    fileMetadata,
    presignedUrl,
    presignedUrlExpiresAt,
  }
}

/**
 * Generate a presigned URL for downloading a file from S3
 */
export async function generatePresignedUrl(
  key: string,
  expiresIn: number = 3600
): Promise<{ url: string; expiresAt: Date }> {
  const client = getS3Client()
  const config = getS3Config()

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  })

  const url = await getSignedUrl(client, command, { expiresIn })
  const expiresAt = new Date(Date.now() + expiresIn * 1000)

  return { url, expiresAt }
}

/**
 * Check if a file exists in S3
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const client = getS3Client()
    const config = getS3Config()

    const command = new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key,
    })

    await client.send(command)
    return true
  } catch (error: unknown) {
    const errorWithCode = error as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (errorWithCode.name === "NotFound" || errorWithCode.$metadata?.httpStatusCode === 404) {
      return false
    }
    throw error
  }
}

/**
 * Generate S3 key for knowledge file
 */
export function generateS3Key(
  organizationId: string,
  knowledgeId: string,
  filename: string
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
  return `${organizationId}/knowledge/${knowledgeId}/${timestamp}-${sanitizedFilename}`
}

/**
 * Validate file type
 */
export function validateFileType(
  filename: string,
  contentType: string,
  allowedTypes: string[]
): boolean {
  const extension = filename.toLowerCase().substring(filename.lastIndexOf("."))
  
  // Check extension
  if (!allowedTypes.includes(extension)) {
    return false
  }

  // Check content type if provided
  if (contentType) {
    // Map extensions to content types
    const typeMap: Record<string, string[]> = {
      ".pdf": ["application/pdf"],
      ".md": ["text/markdown", "text/plain"],
      ".txt": ["text/plain"],
      ".html": ["text/html"],
      ".mp4": ["video/mp4"],
      ".mov": ["video/quicktime"],
      ".avi": ["video/x-msvideo"],
      ".webm": ["video/webm"],
      ".mp3": ["audio/mpeg"],
      ".wav": ["audio/wav"],
      ".yaml": ["application/x-yaml", "text/yaml"],
      ".yml": ["application/x-yaml", "text/yaml"],
      ".json": ["application/json"],
    }

    const expectedTypes = typeMap[extension]
    if (expectedTypes && !expectedTypes.includes(contentType)) {
      // Allow if content type is generic (e.g., application/octet-stream)
      if (contentType !== "application/octet-stream") {
        return false
      }
    }
  }

  return true
}

/**
 * Get file size limit based on file type
 */
export function getFileSizeLimit(fileType: "video" | "documentation" | "audio" | "data"): number {
  const limits: Record<string, number> = {
    video: 500 * 1024 * 1024, // 500MB
    documentation: 50 * 1024 * 1024, // 50MB
    audio: 100 * 1024 * 1024, // 100MB
    data: 10 * 1024 * 1024, // 10MB
  }
  return limits[fileType] || 50 * 1024 * 1024 // Default 50MB
}

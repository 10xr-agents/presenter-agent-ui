import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generatePresignedUrl } from "@/lib/storage/s3-client"

/**
 * GET /api/knowledge/generate-presigned-url
 * Generate a presigned URL for an S3 object
 */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const key = searchParams.get("key")

    if (!key) {
      return NextResponse.json({ error: "key parameter is required" }, { status: 400 })
    }

    const { url, expiresAt } = await generatePresignedUrl(key, 3600)

    return NextResponse.json({
      url,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Failed to generate presigned URL"
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

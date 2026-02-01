/**
 * Multimodal Content Helpers
 *
 * Helper functions for building multimodal (text + image) content
 * for Gemini API requests. Used in the hybrid vision + skeleton pipeline.
 *
 * @see https://ai.google.dev/gemini-api/docs/vision
 */

/**
 * Text part for Gemini multimodal content
 */
export interface TextPart {
  text: string
}

/**
 * Image part for Gemini multimodal content (inline data)
 */
export interface ImagePart {
  inlineData: {
    mimeType: string
    data: string // Base64-encoded image data
  }
}

/**
 * Content part (text or image)
 */
export type ContentPart = TextPart | ImagePart

/**
 * Multimodal content array for Gemini
 */
export type MultimodalContent = ContentPart[]

/**
 * Image input configuration
 */
export interface ImageInput {
  /** Base64-encoded image data (without data URL prefix) */
  data: string
  /** MIME type (default: image/jpeg) */
  mimeType?: string
}

/**
 * Create a text part for multimodal content
 *
 * @param text - Text content
 * @returns Text part object
 */
export function createTextPart(text: string): TextPart {
  return { text }
}

/**
 * Create an image part for multimodal content
 *
 * @param data - Base64-encoded image data (without data URL prefix)
 * @param mimeType - Image MIME type (default: image/jpeg)
 * @returns Image part object
 */
export function createImagePart(data: string, mimeType = "image/jpeg"): ImagePart {
  // Remove data URL prefix if present
  const base64Data = data.includes(",") ? data.split(",")[1] ?? data : data

  return {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  }
}

/**
 * Build multimodal content array from text and optional images.
 * Images are placed before text for better visual context processing.
 *
 * @param text - Text content (required)
 * @param images - Optional array of image inputs
 * @returns Multimodal content array
 */
export function buildMultimodalContent(
  text: string,
  images?: ImageInput[]
): MultimodalContent {
  const parts: ContentPart[] = []

  // Add images first (visual context before text instructions)
  if (images && images.length > 0) {
    for (const image of images) {
      parts.push(createImagePart(image.data, image.mimeType ?? "image/jpeg"))
    }
  }

  // Add text content
  parts.push(createTextPart(text))

  return parts
}

/**
 * Build multimodal content with a single screenshot.
 * Convenience function for the common case of one screenshot + text.
 *
 * @param text - Text content (required)
 * @param screenshot - Optional base64-encoded screenshot
 * @param mimeType - Screenshot MIME type (default: image/jpeg)
 * @returns Multimodal content array or just text if no screenshot
 */
export function buildScreenshotContent(
  text: string,
  screenshot?: string | null,
  mimeType = "image/jpeg"
): MultimodalContent | string {
  if (!screenshot) {
    // No screenshot, return plain text (Gemini accepts string for text-only)
    return text
  }

  return buildMultimodalContent(text, [{ data: screenshot, mimeType }])
}

/**
 * Check if content is multimodal (contains images)
 *
 * @param content - Content to check
 * @returns True if content is multimodal
 */
export function isMultimodalContent(
  content: MultimodalContent | string
): content is MultimodalContent {
  return Array.isArray(content)
}

/**
 * Estimate token count for an image.
 * Gemini charges differently based on image size.
 *
 * Based on Gemini pricing:
 * - Images up to 768x768 = 258 tokens (low detail)
 * - Larger images = 85 base + 170 per 512x512 tile (high detail)
 *
 * @param widthPx - Image width in pixels
 * @param heightPx - Image height in pixels
 * @returns Estimated token count
 */
export function estimateImageTokens(widthPx: number, heightPx: number): number {
  // Low detail threshold
  const LOW_DETAIL_THRESHOLD = 768

  if (widthPx <= LOW_DETAIL_THRESHOLD && heightPx <= LOW_DETAIL_THRESHOLD) {
    return 258 // Low detail fixed cost
  }

  // High detail: calculate tiles
  const TILE_SIZE = 512
  const BASE_TOKENS = 85
  const TOKENS_PER_TILE = 170

  const tilesX = Math.ceil(widthPx / TILE_SIZE)
  const tilesY = Math.ceil(heightPx / TILE_SIZE)
  const totalTiles = tilesX * tilesY

  return BASE_TOKENS + totalTiles * TOKENS_PER_TILE
}

/**
 * Estimate token count for a 1024px wide screenshot.
 * Assumes 16:9 aspect ratio (576px height).
 *
 * @returns Estimated token count (~1,105 tokens)
 */
export function estimateScreenshotTokens(): number {
  // 1024 x 576 (16:9 aspect ratio)
  // Tiles: ceil(1024/512) = 2, ceil(576/512) = 2
  // Total: 85 + (2 * 2) * 170 = 85 + 680 = 765 tokens
  // But Gemini often rounds up, so estimate ~1,000-1,100
  return 1105
}

/**
 * Visual bridge prompt for hybrid mode.
 * Instructs the LLM to use screenshot for spatial understanding
 * and skeleton DOM for action targeting.
 */
export const VISUAL_BRIDGE_PROMPT = `You are provided with:
1. A **Screenshot** of the current page showing the visual layout
2. A **Skeleton DOM** containing only interactive elements (buttons, links, inputs)

**Visual Bridge Instructions:**
- Use the Screenshot to understand spatial layout, visual hierarchy, and element positions
- Use the Skeleton DOM to find the exact element ID for your action
- When the user refers to visual elements ("the button on the right", "the search icon"), identify it in the Screenshot first, then find the matching element in the Skeleton DOM

**Action Targeting:**
- Always use element IDs from the Skeleton DOM for actions
- The Screenshot helps you understand context; the Skeleton DOM provides actionable IDs
- If an element is visible in the Screenshot but not in the Skeleton DOM, it may not be interactive`

/**
 * Format skeleton DOM for LLM prompt
 *
 * @param skeletonDom - Skeleton DOM HTML string
 * @returns Formatted string for prompt
 */
export function formatSkeletonForPrompt(skeletonDom: string): string {
  return `## Interactive Elements (Skeleton DOM)
The following elements are available for interaction:

\`\`\`html
${skeletonDom}
\`\`\`

Use the element IDs above when generating actions like click(id), setValue(id, "text"), etc.`
}

/**
 * Format screenshot context for LLM prompt
 *
 * @param hasScreenshot - Whether a screenshot is included
 * @returns Context string for prompt
 */
export function formatScreenshotContext(hasScreenshot: boolean): string {
  if (!hasScreenshot) {
    return ""
  }

  return `## Visual Context
A screenshot of the current page is provided above. Use it to understand:
- Visual layout and element positions
- Spatial relationships ("top", "bottom", "left", "right")
- Visual indicators (icons, colors, images)

The screenshot shows what the user sees. Match visual elements to IDs in the Skeleton DOM below.`
}

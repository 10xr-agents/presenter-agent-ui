/**
 * Text Chunker
 *
 * Splits text into overlapping chunks for embedding and retrieval.
 * Uses intelligent boundaries (sentences, paragraphs) when possible.
 */

export interface ChunkingConfig {
  /** Target chunk size in characters */
  chunkSize: number
  /** Overlap between chunks in characters */
  chunkOverlap: number
  /** Minimum chunk size (won't create chunks smaller than this) */
  minChunkSize?: number
}

export interface TextChunk {
  /** Chunk index */
  index: number
  /** Chunk text */
  text: string
  /** Start position in original text */
  startPos: number
  /** End position in original text */
  endPos: number
}

const DEFAULT_CONFIG: ChunkingConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  minChunkSize: 100,
}

/**
 * Split text into overlapping chunks
 *
 * Uses sentence boundaries when possible to avoid breaking mid-sentence.
 */
export function chunkText(
  text: string,
  config: Partial<ChunkingConfig> = {}
): TextChunk[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const chunks: TextChunk[] = []

  if (!text || text.length === 0) {
    return chunks
  }

  // If text is smaller than chunk size, return as single chunk
  if (text.length <= cfg.chunkSize) {
    return [
      {
        index: 0,
        text: text.trim(),
        startPos: 0,
        endPos: text.length,
      },
    ]
  }

  // Split into sentences for smarter chunking
  const sentences = splitIntoSentences(text)

  let currentChunk = ""
  let currentStart = 0
  let position = 0

  for (const sentence of sentences) {
    const sentenceLength = sentence.length

    // If adding this sentence would exceed chunk size
    if (currentChunk.length + sentenceLength > cfg.chunkSize && currentChunk.length > 0) {
      // Save current chunk
      const trimmedChunk = currentChunk.trim()
      if (trimmedChunk.length >= (cfg.minChunkSize || 0)) {
        chunks.push({
          index: chunks.length,
          text: trimmedChunk,
          startPos: currentStart,
          endPos: position,
        })
      }

      // Calculate overlap - try to include complete sentences
      const overlapText = getOverlapText(currentChunk, cfg.chunkOverlap)
      currentChunk = overlapText + sentence
      currentStart = position - overlapText.length
    } else {
      currentChunk += sentence
    }

    position += sentenceLength
  }

  // Don't forget the last chunk
  const trimmedChunk = currentChunk.trim()
  if (trimmedChunk.length >= (cfg.minChunkSize || 0)) {
    chunks.push({
      index: chunks.length,
      text: trimmedChunk,
      startPos: currentStart,
      endPos: text.length,
    })
  }

  return chunks
}

/**
 * Split text by paragraphs first, then chunk each paragraph
 *
 * Better for documents with clear section structure.
 */
export function chunkByParagraphs(
  text: string,
  config: Partial<ChunkingConfig> = {}
): TextChunk[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const chunks: TextChunk[] = []

  // Split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/)
  let position = 0

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed) {
      position += paragraph.length + 2 // Account for \n\n
      continue
    }

    // If paragraph fits in one chunk
    if (trimmed.length <= cfg.chunkSize) {
      chunks.push({
        index: chunks.length,
        text: trimmed,
        startPos: position,
        endPos: position + trimmed.length,
      })
    } else {
      // Chunk the paragraph
      const paragraphChunks = chunkText(trimmed, config)
      for (const chunk of paragraphChunks) {
        chunks.push({
          index: chunks.length,
          text: chunk.text,
          startPos: position + chunk.startPos,
          endPos: position + chunk.endPos,
        })
      }
    }

    position += paragraph.length + 2 // Account for \n\n separator
  }

  return chunks
}

/**
 * Chunk markdown with heading awareness
 *
 * Tries to keep content under the same heading together.
 */
export function chunkMarkdown(
  markdown: string,
  config: Partial<ChunkingConfig> = {}
): TextChunk[] {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const chunks: TextChunk[] = []

  // Split by headings (# ## ### etc.)
  const sections = splitByHeadings(markdown)
  let position = 0

  for (const section of sections) {
    const trimmed = section.content.trim()
    if (!trimmed) {
      position += section.content.length
      continue
    }

    // If section fits in one chunk
    if (trimmed.length <= cfg.chunkSize) {
      chunks.push({
        index: chunks.length,
        text: trimmed,
        startPos: position,
        endPos: position + trimmed.length,
      })
    } else {
      // Chunk the section, keeping heading as prefix for context
      const contentChunks = chunkText(trimmed, config)
      for (const chunk of contentChunks) {
        // Add heading context to first chunk of section
        const text = section.heading && chunk.index === 0
          ? `${section.heading}\n\n${chunk.text}`
          : chunk.text

        chunks.push({
          index: chunks.length,
          text,
          startPos: position + chunk.startPos,
          endPos: position + chunk.endPos,
        })
      }
    }

    position += section.content.length
  }

  return chunks
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Simple sentence splitting - handles common cases
  // Keeps the sentence terminator with the sentence
  const sentences: string[] = []
  let current = ""

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    current += char

    // Check for sentence end
    if (char === "." || char === "!" || char === "?") {
      const nextChar = text[i + 1]
      const prevChar = text[i - 1]

      // Check if this is actually end of sentence
      // Avoid splitting on abbreviations, decimals, etc.
      const nextNextChar = text[i + 1]
      const isEndOfSentence =
        // Followed by space and uppercase, or end of text
        (!nextChar || nextChar === " " || nextChar === "\n") &&
        // Not a decimal number
        !(prevChar && /\d/.test(prevChar) && nextNextChar && /\d/.test(nextNextChar)) &&
        // Not common abbreviations
        !isAbbreviation(current)

      if (isEndOfSentence) {
        // Include trailing whitespace with the sentence
        while (text[i + 1] === " " || text[i + 1] === "\n") {
          i++
          current += text[i]
        }
        sentences.push(current)
        current = ""
      }
    }
  }

  // Don't forget remaining text
  if (current.trim()) {
    sentences.push(current)
  }

  return sentences
}

/**
 * Check if text ends with a common abbreviation
 */
function isAbbreviation(text: string): boolean {
  const abbreviations = [
    "Mr.", "Mrs.", "Ms.", "Dr.", "Prof.",
    "Sr.", "Jr.", "Inc.", "Ltd.", "Corp.",
    "vs.", "etc.", "e.g.", "i.e.", "viz.",
    "St.", "Ave.", "Blvd.", "Rd.",
    "Jan.", "Feb.", "Mar.", "Apr.", "Aug.", "Sept.", "Oct.", "Nov.", "Dec.",
  ]

  const lowerText = text.toLowerCase()
  return abbreviations.some((abbr) => lowerText.endsWith(abbr.toLowerCase()))
}

/**
 * Get overlap text from end of chunk
 *
 * Tries to break at sentence boundaries.
 */
function getOverlapText(text: string, targetOverlap: number): string {
  if (text.length <= targetOverlap) {
    return text
  }

  // Get the last `targetOverlap` characters
  const overlap = text.slice(-targetOverlap)

  // Try to find a sentence start
  const sentenceStarts = [". ", "! ", "? ", "\n"]
  let bestPos = 0

  for (const start of sentenceStarts) {
    const pos = overlap.indexOf(start)
    if (pos > bestPos) {
      bestPos = pos + start.length
    }
  }

  // If we found a good break point, use it
  if (bestPos > 0 && bestPos < overlap.length / 2) {
    return overlap.slice(bestPos)
  }

  // Otherwise try to break at word boundary
  const wordBreak = overlap.indexOf(" ")
  if (wordBreak > 0 && wordBreak < overlap.length / 3) {
    return overlap.slice(wordBreak + 1)
  }

  return overlap
}

/**
 * Split markdown by headings
 */
function splitByHeadings(markdown: string): Array<{ heading?: string; content: string }> {
  const sections: Array<{ heading?: string; content: string }> = []
  const headingRegex = /^(#{1,6}\s+.+)$/gm
  let lastIndex = 0
  let lastHeading: string | undefined

  let match
  while ((match = headingRegex.exec(markdown)) !== null) {
    // Save content before this heading
    if (match.index > lastIndex) {
      const content = markdown.slice(lastIndex, match.index)
      if (content.trim()) {
        sections.push({
          heading: lastHeading,
          content,
        })
      }
    }

    lastHeading = match[1]
    lastIndex = match.index
  }

  // Don't forget content after last heading
  if (lastIndex < markdown.length) {
    const content = markdown.slice(lastIndex)
    if (content.trim()) {
      sections.push({
        heading: lastHeading,
        content,
      })
    }
  }

  return sections
}

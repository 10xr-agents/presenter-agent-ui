/**
 * Domain extraction utilities for domain-aware sessions.
 *
 * Extracts root domain from URLs following these rules:
 * 1. Standard domains: Extract last 2 parts (www.google.com → google.com)
 * 2. Multi-part TLDs: Extract last 3 parts (www.example.co.uk → example.co.uk)
 * 3. Special cases: localhost, IP addresses, single part hostnames kept as-is
 */

// Multi-part TLDs that require 3 parts instead of 2
const MULTI_PART_TLDS = new Set([
  "co.uk",
  "co.nz",
  "co.za",
  "co.in",
  "co.jp",
  "co.kr",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "com.hk",
  "com.tw",
  "org.uk",
  "org.au",
  "net.au",
  "gov.uk",
  "ac.uk",
  "edu.au",
])

/**
 * Extract root domain from a URL.
 *
 * @param url - Full URL string (e.g., "https://www.google.com/search?q=test")
 * @returns Root domain (e.g., "google.com") or null if extraction fails
 *
 * @example
 * extractDomain("https://www.google.com") // "google.com"
 * extractDomain("https://mail.google.com") // "google.com"
 * extractDomain("https://www.example.co.uk") // "example.co.uk"
 * extractDomain("http://localhost:3000") // "localhost"
 * extractDomain("https://192.168.1.1") // "192.168.1.1"
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()

    // Handle localhost
    if (hostname === "localhost") {
      return "localhost"
    }

    // Handle IP addresses (both IPv4 and IPv6)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    const ipv6Regex = /^\[?([0-9a-f:]+)\]?$/i
    if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
      return hostname
    }

    // Split hostname into parts
    const parts = hostname.split(".")

    // Single part hostname (e.g., "localhost" without TLD)
    if (parts.length === 1) {
      return hostname
    }

    // Two parts (e.g., "google.com") - return as-is
    if (parts.length === 2) {
      return hostname
    }

    // Check for multi-part TLDs
    const lastTwoParts = parts.slice(-2).join(".")
    if (MULTI_PART_TLDS.has(lastTwoParts)) {
      // Return last 3 parts for multi-part TLDs
      return parts.slice(-3).join(".")
    }

    // Standard domain: return last 2 parts
    return parts.slice(-2).join(".")
  } catch {
    // Invalid URL
    return null
  }
}

/**
 * Generate a session title with domain prefix.
 *
 * @param domain - Root domain (e.g., "google.com")
 * @param taskDescription - Task description (e.g., "Search for flights")
 * @returns Formatted title (e.g., "google.com: Search for flights")
 */
export function generateSessionTitle(
  domain: string,
  taskDescription: string = "New Task"
): string {
  // Truncate task description if too long
  const maxDescriptionLength = 200
  const truncatedDescription =
    taskDescription.length > maxDescriptionLength
      ? taskDescription.substring(0, maxDescriptionLength - 3) + "..."
      : taskDescription

  return `${domain}: ${truncatedDescription}`
}

/**
 * Extract domain prefix from a session title.
 *
 * @param title - Session title (e.g., "google.com: Search for flights")
 * @returns Domain prefix (e.g., "google.com") or null if no prefix found
 */
export function extractDomainFromTitle(title: string): string | null {
  const colonIndex = title.indexOf(":")
  if (colonIndex === -1) {
    return null
  }

  const potentialDomain = title.substring(0, colonIndex).trim()

  // Validate it looks like a domain
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*$|^localhost$/
  if (domainRegex.test(potentialDomain)) {
    return potentialDomain
  }

  return null
}

/**
 * Update session title while preserving domain prefix.
 *
 * @param currentTitle - Current session title
 * @param newDescription - New task description
 * @returns Updated title with preserved domain prefix
 */
export function updateTitlePreservingDomain(
  currentTitle: string,
  newDescription: string
): string {
  const domain = extractDomainFromTitle(currentTitle)
  if (domain) {
    return generateSessionTitle(domain, newDescription)
  }
  return newDescription
}

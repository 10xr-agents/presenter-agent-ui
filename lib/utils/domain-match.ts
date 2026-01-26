/**
 * Domain pattern matching for allowed_domains (§1.6 THIN_CLIENT_ROADMAP_SERVER).
 *
 * Supports:
 * - `*.example.com` — matches subdomains (e.g. app.example.com, docs.example.com)
 * - `example.com` — exact match only
 * - `app.example.com` — exact match only
 */

/**
 * Normalize domain: lowercase, strip www. prefix.
 */
function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "").trim()
}

/**
 * Check if a domain matches an allowed_domains pattern.
 *
 * @param domain - Active domain (e.g. from new URL(url).hostname)
 * @param pattern - allowed_domains.domainPattern (e.g. "*.example.com", "app.acme.com")
 */
export function matchesDomainPattern(domain: string, pattern: string): boolean {
  const d = normalizeDomain(domain)
  const p = normalizeDomain(pattern)

  if (p.startsWith("*.")) {
    const suffix = p.slice(2) // e.g. "example.com"
    if (!suffix) return false
    // Must end with .suffix or equal suffix; and have at least one subdomain when pattern is *.*
    if (d === suffix) return true
    if (!d.endsWith("." + suffix)) return false
    const prefix = d.slice(0, -(suffix.length + 1))
    return prefix.length > 0
  }

  return d === p
}

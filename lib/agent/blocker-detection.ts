/**
 * Blocker Detection Service
 *
 * Unified detection for various blockers that require user intervention:
 * - Login/authentication failures
 * - CAPTCHA challenges
 * - Cookie consent/privacy banners
 * - Modal dialogs requiring user decision
 * - Missing required information
 * - Rate limiting
 *
 * When a blocker is detected, the task is paused and the user can either:
 * 1. Resolve the blocker directly on the website
 * 2. Provide the required information via chat
 * 3. Cancel the task
 */

/**
 * Types of blockers that can pause a task
 */
export type BlockerType =
  | "login_failure" // Invalid credentials, auth errors
  | "mfa_required" // Multi-factor authentication needed
  | "captcha" // CAPTCHA challenge
  | "cookie_consent" // Cookie/privacy banner (auto-dismissable sometimes)
  | "modal_decision" // Modal requiring user decision
  | "missing_info" // Required field the agent doesn't have
  | "rate_limit" // Too many attempts
  | "session_expired" // Session timeout
  | "access_denied" // Permission/authorization error
  | "page_error" // Page error (404, 500, etc.)

/**
 * How the user can resolve the blocker
 */
export type ResolutionMethod =
  | "user_action_on_web" // User acts directly on the website
  | "provide_in_chat" // User provides data via chat
  | "auto_retry" // Agent can retry after delay
  | "alternative_action" // Agent can try different approach

/**
 * Blocker detection result
 */
export interface BlockerDetectionResult {
  /** Whether a blocker was detected */
  detected: boolean
  /** Type of blocker */
  type?: BlockerType
  /** Human-readable description of the blocker */
  description?: string
  /** The matched pattern or element that triggered detection */
  matchedPattern?: string
  /** Available resolution methods */
  resolutionMethods?: ResolutionMethod[]
  /** User-friendly message explaining what to do */
  userMessage?: string
  /** Fields the user needs to provide (for missing_info type) */
  requiredFields?: Array<{
    name: string
    label: string
    type: "text" | "password" | "email" | "code"
    description?: string
  }>
  /** Suggested wait time before retry (for rate_limit type) */
  retryAfterSeconds?: number
  /** Confidence score (0-1) */
  confidence?: number
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Login/authentication failure patterns
 */
const LOGIN_FAILURE_PATTERNS = [
  // Generic auth errors
  { pattern: /invalid\s+(credentials?|username|password|login)/i, confidence: 0.95 },
  { pattern: /login\s+failed/i, confidence: 0.95 },
  { pattern: /authentication\s+failed/i, confidence: 0.95 },
  { pattern: /incorrect\s+(password|username|credentials?)/i, confidence: 0.95 },
  { pattern: /wrong\s+(password|username|credentials?)/i, confidence: 0.95 },
  { pattern: /password\s+(is\s+)?incorrect/i, confidence: 0.95 },
  // Account issues
  { pattern: /account\s+(not\s+found|locked|disabled|suspended)/i, confidence: 0.9 },
  { pattern: /user\s+not\s+found/i, confidence: 0.9 },
  { pattern: /no\s+account\s+(found|exists)/i, confidence: 0.9 },
  { pattern: /email\s+(not\s+registered|not\s+found)/i, confidence: 0.9 },
]

/**
 * MFA/2FA patterns
 */
const MFA_PATTERNS = [
  { pattern: /enter\s+(the\s+)?(verification|security)\s+code/i, confidence: 0.95 },
  { pattern: /two.?factor\s+authentication/i, confidence: 0.95 },
  { pattern: /2fa|mfa/i, confidence: 0.8 },
  { pattern: /sent\s+(a\s+)?code\s+to\s+(your\s+)?(phone|email|device)/i, confidence: 0.9 },
  { pattern: /authenticator\s+app/i, confidence: 0.9 },
  { pattern: /verify\s+(your|it'?s)\s+you/i, confidence: 0.85 },
  { pattern: /security\s+check/i, confidence: 0.7 },
]

/**
 * CAPTCHA patterns
 */
const CAPTCHA_PATTERNS = [
  { pattern: /captcha/i, confidence: 0.95 },
  { pattern: /recaptcha/i, confidence: 0.95 },
  { pattern: /hcaptcha/i, confidence: 0.95 },
  { pattern: /i'?m\s+not\s+a\s+robot/i, confidence: 0.95 },
  { pattern: /verify\s+(you'?re|you\s+are)\s+(human|not\s+a\s+bot)/i, confidence: 0.9 },
  { pattern: /select\s+all\s+(images|squares)/i, confidence: 0.85 },
  { pattern: /click\s+on\s+all\s+(images|pictures)/i, confidence: 0.85 },
]

/**
 * Cookie consent patterns
 */
const COOKIE_CONSENT_PATTERNS = [
  { pattern: /cookie\s+(consent|policy|preferences|settings)/i, confidence: 0.9 },
  { pattern: /accept\s+(all\s+)?cookies/i, confidence: 0.9 },
  { pattern: /we\s+use\s+cookies/i, confidence: 0.85 },
  { pattern: /gdpr|ccpa/i, confidence: 0.8 },
  { pattern: /privacy\s+(policy|settings|preferences)/i, confidence: 0.7 },
  { pattern: /manage\s+(cookie|privacy)\s+(settings|preferences)/i, confidence: 0.85 },
]

/**
 * Rate limiting patterns
 */
const RATE_LIMIT_PATTERNS = [
  { pattern: /too\s+many\s+(attempts|tries|requests)/i, confidence: 0.95 },
  { pattern: /rate\s+limit(ed)?/i, confidence: 0.95 },
  { pattern: /temporarily\s+(locked|blocked|unavailable)/i, confidence: 0.9 },
  { pattern: /try\s+again\s+(in|after)\s+\d+/i, confidence: 0.9 },
  { pattern: /slow\s+down/i, confidence: 0.8 },
  { pattern: /please\s+wait/i, confidence: 0.6 },
]

/**
 * Session expired patterns
 */
const SESSION_EXPIRED_PATTERNS = [
  { pattern: /session\s+(has\s+)?expired/i, confidence: 0.95 },
  { pattern: /please\s+(log\s*in|sign\s*in)\s+again/i, confidence: 0.9 },
  { pattern: /your\s+session\s+has\s+timed?\s*out/i, confidence: 0.95 },
  { pattern: /you('ve|\s+have)\s+been\s+logged?\s*out/i, confidence: 0.9 },
  { pattern: /login\s+(session\s+)?timeout/i, confidence: 0.9 },
]

/**
 * Access denied patterns
 */
const ACCESS_DENIED_PATTERNS = [
  { pattern: /access\s+denied/i, confidence: 0.95 },
  { pattern: /permission\s+denied/i, confidence: 0.95 },
  { pattern: /unauthorized/i, confidence: 0.9 },
  { pattern: /forbidden/i, confidence: 0.85 },
  { pattern: /you\s+don'?t\s+have\s+(access|permission)/i, confidence: 0.9 },
  { pattern: /not\s+authorized/i, confidence: 0.9 },
]

/**
 * Page error patterns
 */
const PAGE_ERROR_PATTERNS = [
  { pattern: /page\s+not\s+found/i, confidence: 0.95 },
  { pattern: /404\s+(error|not\s+found)/i, confidence: 0.95 },
  { pattern: /500\s+(internal\s+)?server\s+error/i, confidence: 0.95 },
  { pattern: /something\s+went\s+wrong/i, confidence: 0.7 },
  { pattern: /oops!/i, confidence: 0.5 },
  { pattern: /error\s+occurred/i, confidence: 0.7 },
]

/**
 * Modal/dialog patterns (generic)
 */
const MODAL_PATTERNS = [
  { pattern: /\[role="dialog"\]/i, confidence: 0.8 },
  { pattern: /class="[^"]*modal[^"]*"/i, confidence: 0.8 },
  { pattern: /class="[^"]*overlay[^"]*"/i, confidence: 0.7 },
  { pattern: /class="[^"]*popup[^"]*"/i, confidence: 0.7 },
]

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Check content against a set of patterns
 */
function matchPatterns(
  content: string,
  patterns: Array<{ pattern: RegExp; confidence: number }>
): { matched: boolean; pattern?: string; confidence: number } {
  for (const { pattern, confidence } of patterns) {
    const match = content.match(pattern)
    if (match) {
      return { matched: true, pattern: match[0], confidence }
    }
  }
  return { matched: false, confidence: 0 }
}

/**
 * Detect login/authentication failures
 */
export function detectLoginFailure(
  dom: string,
  url?: string
): BlockerDetectionResult {
  // Check if we're in a login context
  const loginContextPatterns = [/login/i, /sign\s*in/i, /log\s*in/i, /authenticate/i]
  const inLoginContext =
    (url && loginContextPatterns.some((p) => p.test(url))) ||
    loginContextPatterns.some((p) => p.test(dom.slice(0, 5000)))

  if (!inLoginContext) {
    return { detected: false }
  }

  const result = matchPatterns(dom, LOGIN_FAILURE_PATTERNS)
  if (result.matched) {
    return {
      detected: true,
      type: "login_failure",
      description: "Login failed due to invalid credentials",
      matchedPattern: result.pattern,
      confidence: result.confidence,
      resolutionMethods: ["provide_in_chat", "user_action_on_web"],
      userMessage: `I tried to log in, but the site says "${result.pattern}". Could you provide the correct credentials?`,
      requiredFields: [
        { name: "username", label: "Username or Email", type: "text" },
        { name: "password", label: "Password", type: "password" },
      ],
    }
  }

  return { detected: false }
}

/**
 * Detect MFA/2FA challenges
 */
export function detectMfaChallenge(dom: string): BlockerDetectionResult {
  const result = matchPatterns(dom, MFA_PATTERNS)
  if (result.matched) {
    return {
      detected: true,
      type: "mfa_required",
      description: "Multi-factor authentication is required",
      matchedPattern: result.pattern,
      confidence: result.confidence,
      resolutionMethods: ["user_action_on_web", "provide_in_chat"],
      userMessage: `The site requires a verification code. Please check your phone/email and either enter it on the website or provide it here.`,
      requiredFields: [
        { name: "code", label: "Verification Code", type: "code", description: "6-digit code from your phone/email" },
      ],
    }
  }

  return { detected: false }
}

/**
 * Detect CAPTCHA challenges
 */
export function detectCaptcha(dom: string): BlockerDetectionResult {
  const result = matchPatterns(dom, CAPTCHA_PATTERNS)
  if (result.matched) {
    return {
      detected: true,
      type: "captcha",
      description: "CAPTCHA verification is required",
      matchedPattern: result.pattern,
      confidence: result.confidence,
      resolutionMethods: ["user_action_on_web"],
      userMessage: `There's a CAPTCHA that I cannot solve. Please complete it on the website, then let me know when you're done.`,
    }
  }

  return { detected: false }
}

/**
 * Detect cookie consent banners
 */
export function detectCookieConsent(dom: string): BlockerDetectionResult {
  const result = matchPatterns(dom, COOKIE_CONSENT_PATTERNS)
  if (result.matched) {
    return {
      detected: true,
      type: "cookie_consent",
      description: "Cookie consent banner detected",
      matchedPattern: result.pattern,
      confidence: result.confidence,
      resolutionMethods: ["alternative_action", "user_action_on_web"],
      userMessage: `There's a cookie consent banner. I'll try to dismiss it automatically. If that doesn't work, please accept/decline it yourself.`,
    }
  }

  return { detected: false }
}

/**
 * Detect rate limiting
 */
export function detectRateLimit(dom: string): BlockerDetectionResult {
  const result = matchPatterns(dom, RATE_LIMIT_PATTERNS)
  if (result.matched) {
    // Try to extract wait time
    const timeMatch = dom.match(/try\s+again\s+(in|after)\s+(\d+)\s*(seconds?|minutes?|hours?)?/i)
    let retryAfterSeconds: number | undefined
    if (timeMatch) {
      const value = parseInt(timeMatch[2] ?? "0", 10)
      const unit = timeMatch[3]?.toLowerCase() ?? "seconds"
      if (unit.startsWith("minute")) {
        retryAfterSeconds = value * 60
      } else if (unit.startsWith("hour")) {
        retryAfterSeconds = value * 3600
      } else {
        retryAfterSeconds = value
      }
    }

    return {
      detected: true,
      type: "rate_limit",
      description: "Rate limit reached",
      matchedPattern: result.pattern,
      confidence: result.confidence,
      resolutionMethods: ["auto_retry"],
      userMessage: retryAfterSeconds
        ? `The site says we're making too many requests. Please wait ${retryAfterSeconds} seconds before continuing.`
        : `The site has rate-limited us. Please wait a moment before trying again.`,
      retryAfterSeconds,
    }
  }

  return { detected: false }
}

/**
 * Detect session expiration
 */
export function detectSessionExpired(dom: string): BlockerDetectionResult {
  const result = matchPatterns(dom, SESSION_EXPIRED_PATTERNS)
  if (result.matched) {
    return {
      detected: true,
      type: "session_expired",
      description: "Session has expired",
      matchedPattern: result.pattern,
      confidence: result.confidence,
      resolutionMethods: ["user_action_on_web", "provide_in_chat"],
      userMessage: `Your session has expired. Please log in again on the website or provide your credentials here.`,
      requiredFields: [
        { name: "username", label: "Username or Email", type: "text" },
        { name: "password", label: "Password", type: "password" },
      ],
    }
  }

  return { detected: false }
}

/**
 * Detect access denied errors
 */
export function detectAccessDenied(dom: string): BlockerDetectionResult {
  const result = matchPatterns(dom, ACCESS_DENIED_PATTERNS)
  if (result.matched) {
    return {
      detected: true,
      type: "access_denied",
      description: "Access denied to this resource",
      matchedPattern: result.pattern,
      confidence: result.confidence,
      resolutionMethods: ["user_action_on_web"],
      userMessage: `Access was denied: "${result.pattern}". You may need to log in with an account that has the right permissions.`,
    }
  }

  return { detected: false }
}

/**
 * Detect page errors (404, 500, etc.)
 */
export function detectPageError(dom: string): BlockerDetectionResult {
  const result = matchPatterns(dom, PAGE_ERROR_PATTERNS)
  if (result.matched) {
    return {
      detected: true,
      type: "page_error",
      description: "Page error encountered",
      matchedPattern: result.pattern,
      confidence: result.confidence,
      resolutionMethods: ["alternative_action"],
      userMessage: `The page shows an error: "${result.pattern}". I'll try a different approach.`,
    }
  }

  return { detected: false }
}

/**
 * Main blocker detection function - checks all blocker types
 *
 * @param dom - Current DOM content
 * @param url - Current page URL
 * @param options - Detection options
 * @returns Blocker detection result (first matching blocker with highest confidence)
 */
export function detectBlocker(
  dom: string,
  url?: string,
  options: {
    /** Skip cookie consent detection (often auto-dismissable) */
    skipCookieConsent?: boolean
    /** Skip page error detection (may be handled by correction) */
    skipPageErrors?: boolean
    /** Minimum confidence threshold */
    minConfidence?: number
  } = {}
): BlockerDetectionResult {
  const { skipCookieConsent = false, skipPageErrors = false, minConfidence = 0.7 } = options

  // Order matters - check most critical blockers first
  const detectors: Array<() => BlockerDetectionResult> = [
    () => detectCaptcha(dom),
    () => detectMfaChallenge(dom),
    () => detectLoginFailure(dom, url),
    () => detectSessionExpired(dom),
    () => detectRateLimit(dom),
    () => detectAccessDenied(dom),
  ]

  // Optional detectors
  if (!skipCookieConsent) {
    detectors.push(() => detectCookieConsent(dom))
  }
  if (!skipPageErrors) {
    detectors.push(() => detectPageError(dom))
  }

  // Find first matching blocker above confidence threshold
  for (const detect of detectors) {
    const result = detect()
    if (result.detected && (result.confidence ?? 0) >= minConfidence) {
      return result
    }
  }

  return { detected: false }
}

/**
 * Check if a blocker type requires user intervention (cannot be auto-resolved)
 */
export function requiresUserIntervention(blockerType: BlockerType): boolean {
  const userRequiredTypes: BlockerType[] = [
    "login_failure",
    "mfa_required",
    "captcha",
    "missing_info",
    "access_denied",
  ]
  return userRequiredTypes.includes(blockerType)
}

/**
 * Check if a blocker type can be auto-retried after delay
 */
export function canAutoRetry(blockerType: BlockerType): boolean {
  const autoRetryTypes: BlockerType[] = ["rate_limit", "page_error"]
  return autoRetryTypes.includes(blockerType)
}

/**
 * Check if a blocker type might be auto-dismissable
 */
export function canAutoDismiss(blockerType: BlockerType): boolean {
  const autoDismissTypes: BlockerType[] = ["cookie_consent", "modal_decision"]
  return autoDismissTypes.includes(blockerType)
}

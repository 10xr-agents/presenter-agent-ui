import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { isOnboardingComplete } from "@/lib/onboarding/flow"

/**
 * Get the post-authentication redirect URL based on user state
 * 
 * Routing contract:
 * - First-time user (onboarding not completed) → /onboarding
 * - Returning user (onboarding completed) → /dashboard (or callbackUrl if provided)
 * 
 * @param callbackUrl - Optional callback URL from query params
 * @returns The URL to redirect to after authentication
 */
export async function getPostAuthRedirect(callbackUrl?: string | null): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    return "/login"
  }

  // Check onboarding status
  const completed = await isOnboardingComplete(session.user.id)
  
  if (!completed) {
    // First-time user - must complete onboarding
    return "/onboarding"
  }

  // Returning user - redirect to dashboard or callback URL
  // Validate callbackUrl to prevent open redirects
  if (callbackUrl && isValidInternalUrl(callbackUrl)) {
    return callbackUrl
  }

  return "/dashboard"
}

/**
 * Validate that a URL is an internal route (prevents open redirects)
 */
function isValidInternalUrl(url: string): boolean {
  try {
    const urlObj = new URL(url, "http://localhost")
    // Only allow relative paths or same-origin URLs
    return urlObj.pathname.startsWith("/") && !urlObj.pathname.startsWith("//")
  } catch {
    return false
  }
}

/**
 * Check if user should be redirected to onboarding
 * Used in middleware/proxy to enforce onboarding completion
 */
export async function shouldRedirectToOnboarding(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    return false
  }

  const completed = await isOnboardingComplete(session.user.id)
  return !completed
}

/**
 * Viewer Authentication
 * 
 * Handles optional email-based authentication for presentation viewers
 */

export interface ViewerAuthData {
  email?: string
  name?: string
  sessionToken: string
}

/**
 * Validate viewer email (optional)
 */
export function validateViewerEmail(email?: string): boolean {
  if (!email) {
    return true // Email is optional
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Check if viewer authentication is required for a session
 */
export function isViewerAuthRequired(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  screenAgentConfig: Record<string, any>
): boolean {
  // Check if the screen agent requires viewer authentication
  return screenAgentConfig.viewerAuthRequired === true
}

/**
 * Authenticate viewer (optional email-based)
 */
export async function authenticateViewer(
  sessionToken: string,
  email?: string
): Promise<{ authenticated: boolean; error?: string }> {
  try {
    // If email is provided, validate it
    if (email && !validateViewerEmail(email)) {
      return {
        authenticated: false,
        error: "Invalid email format",
      }
    }

    // TODO: Implement actual authentication logic
    // This could include:
    // - Checking if email is in allowed list
    // - Sending verification email
    // - Checking session token validity
    // - Rate limiting

    // For now, if email is valid (or not provided), allow access
    return {
      authenticated: true,
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      authenticated: false,
      error: errorMessage,
    }
  }
}

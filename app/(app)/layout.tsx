import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { MobileSidebar } from "@/components/app-shell/mobile-sidebar"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { auth } from "@/lib/auth"
import { isOnboardingComplete } from "@/lib/onboarding/flow"
import { userHasPassword } from "@/lib/utils/password-check"
import { getTenantOperatingMode } from "@/lib/utils/tenant-state"

// Force dynamic rendering - this layout uses headers() for session checking
export const dynamic = "force-dynamic"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let session
  try {
    session = await auth.api.getSession({ headers: await headers() })
  } catch (error: unknown) {
    // Handle database connection errors (timeouts, network issues, etc.)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorString = String(error)
    
    // Check if this is a Prisma/MongoDB connection error
    const isDatabaseError = 
      errorMessage.includes("timed out") ||
      errorMessage.includes("I/O error") ||
      errorString.includes("P2010") ||
      errorString.includes("PrismaClientKnownRequestError") ||
      errorMessage.includes("connect ECONNREFUSED") ||
      errorMessage.includes("MongoNetworkError")
    
    if (isDatabaseError) {
      console.error("[AppLayout] Database connection error:", {
        error: errorMessage,
        timestamp: new Date().toISOString(),
      })
      // Redirect to login on database errors to prevent UI crashes
      // The user will need to retry once the database is available
      redirect("/login?error=database_unavailable")
    }
    
    // For other errors, log and redirect to login
    console.error("[AppLayout] Unexpected error fetching session:", error)
    redirect("/login")
  }

  if (!session) {
    redirect("/login")
  }

  // Check if user has a password (required for Chrome extension)
  let hasPassword = false
  try {
    hasPassword = await userHasPassword(session.user.id)
  } catch (error: unknown) {
    console.error("[AppLayout] Error checking password status:", error)
    // Default to requiring password if we can't check
    hasPassword = false
  }

  if (!hasPassword) {
    redirect("/set-password")
  }

  // Check onboarding status - redirect to onboarding if not completed
  let completed = false
  try {
    completed = await isOnboardingComplete(session.user.id)
  } catch (error: unknown) {
    // If onboarding check fails, log but continue (don't block the app)
    console.error("[AppLayout] Error checking onboarding status:", error)
    // Default to showing onboarding if we can't check
    completed = false
  }

  if (!completed) {
    redirect("/onboarding")
  }

  // Get tenant state for sidebar
  let tenantState: "normal" | "organization" = "normal"
  try {
    tenantState = await getTenantOperatingMode(session.user.id)
  } catch (error: unknown) {
    // If tenant state check fails, default to normal mode
    console.error("[AppLayout] Error getting tenant state:", error)
    tenantState = "normal"
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar - Left Panel */}
      <AppSidebar tenantState={tenantState} />

      {/* Main Content - Right Panel */}
      <main className="flex-1 overflow-y-auto bg-background">
        {/* Mobile menu trigger - shown only on mobile */}
        <div className="lg:hidden">
          <MobileSidebar tenantState={tenantState} />
        </div>

        {/* Content container - centered with max-width constraint */}
        <div className="mx-auto max-w-[1000px] px-6 py-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
    </div>
  )
}

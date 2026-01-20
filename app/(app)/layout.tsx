import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { MobileSidebar } from "@/components/app-shell/mobile-sidebar"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { auth } from "@/lib/auth"
import { isOnboardingComplete } from "@/lib/onboarding/flow"
import { getTenantState } from "@/lib/utils/tenant-state"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Check onboarding status - redirect to onboarding if not completed
  const completed = await isOnboardingComplete(session.user.id)
  if (!completed) {
    redirect("/onboarding")
  }

  // Get tenant state for sidebar
  const tenantState = await getTenantState(session.user.id)

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

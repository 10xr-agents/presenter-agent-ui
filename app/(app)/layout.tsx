import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppHeader } from "@/components/app-shell/app-header"
import { AppSidebar } from "@/components/app-shell/app-sidebar"
import { ErrorBoundary } from "@/components/ui/error-boundary"
import { auth } from "@/lib/auth"
import { isOnboardingComplete } from "@/lib/onboarding/flow"
import { getTenantState } from "@/lib/utils/tenant-state"
import { spacing } from "@/lib/utils/design-system"

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

  // Get tenant state for header and sidebar
  const tenantState = await getTenantState(session.user.id)

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader tenantState={tenantState} />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar tenantState={tenantState} />
        <main className="flex-1 overflow-y-auto">
          <div className={spacing.pageContainer + " py-8"}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}

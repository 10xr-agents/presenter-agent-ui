import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageShell } from "@/components/shell/page-shell"
import { auth } from "@/lib/auth"

/**
 * Billing Page
 * 
 * Purpose: Unified billing management page showing subscription
 * status, usage limits, payment methods, and invoices.
 * 
 * Features:
 * - Current plan display
 * - Usage meter (tasks/tokens used vs limit)
 * - Payment method management
 * - Invoice history
 */
export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    redirect("/login")
  }

  return (
    <PageShell
      title="Billing"
      description="Manage your subscription and payment methods"
    >
      <div className="space-y-6">
        {/* Placeholder content - will be replaced in Phase 3 */}
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Billing management coming soon.
          </p>
        </div>
      </div>
    </PageShell>
  )
}

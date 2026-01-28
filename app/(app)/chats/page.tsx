import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageShell } from "@/components/shell/page-shell"
import { auth } from "@/lib/auth"

/**
 * Chats Page - Activity Log
 * 
 * Purpose: Display a unified list of Active and Archived sessions
 * from the Chrome Extension's activity.
 * 
 * Features:
 * - Table/list of sessions with status, domain, task, timestamps
 * - Filtering by status (Active/Archived/All)
 * - Sorting by date
 * - Click to view session detail
 */
export default async function ChatsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    redirect("/login")
  }

  return (
    <PageShell
      title="Chats"
      description="View your Browser Copilot activity and session history"
    >
      <div className="space-y-6">
        {/* Placeholder content - will be replaced in Phase 2 */}
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Session history will appear here once you start using the Browser Copilot extension.
          </p>
        </div>
      </div>
    </PageShell>
  )
}

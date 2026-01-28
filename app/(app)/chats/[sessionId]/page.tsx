import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageShell } from "@/components/shell/page-shell"
import { auth } from "@/lib/auth"

interface SessionDetailPageProps {
  params: Promise<{ sessionId: string }>
}

/**
 * Session Detail Page
 * 
 * Purpose: Read-only view of a session's chat history,
 * execution steps, and screenshots.
 * 
 * Features:
 * - Chat history (user/assistant messages)
 * - Execution steps timeline
 * - Screenshots (if available)
 * - Session metrics (tokens, cost, duration)
 */
export default async function SessionDetailPage({ params }: SessionDetailPageProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    redirect("/login")
  }

  const { sessionId } = await params

  return (
    <PageShell
      title="Session Detail"
      description="View chat history and execution steps"
    >
      <div className="space-y-6">
        {/* Placeholder content - will be replaced in Phase 2 */}
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Session ID: {sessionId}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Session detail view coming soon.
          </p>
        </div>
      </div>
    </PageShell>
  )
}

import { ArrowLeft } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { KnowledgeCreationWizard } from "@/components/knowledge/knowledge-creation-wizard"
import { PageShell } from "@/components/shell/page-shell"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { getActiveOrganizationId, getTenantOperatingMode } from "@/lib/utils/tenant-state"

export default async function NewKnowledgePage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Get tenant state and organization ID
  const tenantState = await getTenantOperatingMode(session.user.id)
  let organizationId: string | null = null
  if (tenantState === "organization") {
    organizationId = await getActiveOrganizationId()
  }

  // In normal mode, use user ID; in organization mode, use organization ID
  const knowledgeOrgId = tenantState === "normal" ? session.user.id : (organizationId || session.user.id)

  return (
    <PageShell
      title="Create Knowledge"
      description="Extract and index knowledge from websites, documentation, videos, or files"
    >
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Link href="/knowledge">
              <ArrowLeft className="mr-1.5 h-3 w-3" />
              Knowledge
            </Link>
          </Button>
        </div>

        {/* Wizard Content */}
        <KnowledgeCreationWizard organizationId={knowledgeOrgId} />
      </div>
    </PageShell>
  )
}

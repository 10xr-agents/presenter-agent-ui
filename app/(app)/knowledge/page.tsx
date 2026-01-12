import { Plus } from "lucide-react"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/app-shell"
import { KnowledgeList } from "@/components/knowledge/knowledge-list"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/auth"

export default async function KnowledgePage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // Get organization ID from Better Auth active organization context
  // For now, using a default - this should come from Better Auth
  const organizationId = "default-org" // TODO: Get from Better Auth active organization

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="Knowledge"
        description="Manage website knowledge extracted from your target sites"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Knowledge" },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href="/knowledge/new">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create Knowledge
            </Link>
          </Button>
        }
      />
      <KnowledgeList organizationId={organizationId} />
    </div>
  )
}

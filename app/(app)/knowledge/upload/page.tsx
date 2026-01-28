import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PageShell } from "@/components/shell/page-shell"
import { auth } from "@/lib/auth"

/**
 * Knowledge Upload Page
 * 
 * Purpose: Streamlined interface for uploading documents
 * and indexing links/sitemaps.
 * 
 * Features:
 * - Document upload (PDF, TXT, DOCX, MD)
 * - Link indexing (single, sitemap, spider crawl)
 * - Progress indicators
 * - Validation and error handling
 */
export default async function KnowledgeUploadPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  
  if (!session) {
    redirect("/login")
  }

  return (
    <PageShell
      title="Add Knowledge"
      description="Upload documents or index web pages for RAG"
    >
      <div className="space-y-6">
        {/* Placeholder content - will be replaced in Phase 2 */}
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Knowledge upload interface coming soon.
          </p>
        </div>
      </div>
    </PageShell>
  )
}

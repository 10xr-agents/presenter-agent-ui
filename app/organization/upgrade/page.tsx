import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { UpgradePageClient } from "./upgrade-client"

export default async function OrganizationUpgradePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    redirect("/login")
  }

  // Get active organization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeOrgResult = await (auth.api as any).getActiveOrganization({
    headers: await headers(),
  })

  if (activeOrgResult.error || !activeOrgResult.data) {
    redirect("/")
  }

  const organizationId = activeOrgResult.data.id

  return (
    <div className="container mx-auto py-8">
      <UpgradePageClient organizationId={organizationId} />
    </div>
  )
}

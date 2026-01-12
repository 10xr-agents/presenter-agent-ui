import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getTenantState } from "@/lib/utils/tenant-state"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tenantState = await getTenantState(session.user.id)

    return NextResponse.json({ state: tenantState })
  } catch (error: unknown) {
    console.error("Get tenant state error:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch tenant state"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get connected OAuth accounts
    const accounts = await prisma.account.findMany({
      where: {
        userId: session.user.id,
        providerId: {
          in: ["google", "github"],
        },
      },
      select: {
        providerId: true,
        createdAt: true,
      },
    })

    const connectedAccounts = accounts.map((account: { providerId: string; createdAt: Date }) => ({
      provider: account.providerId,
      email: session.user.email || "",
      connectedAt: account.createdAt.toISOString(),
    }))

    return NextResponse.json({ accounts: connectedAccounts })
  } catch (error: unknown) {
    console.error("Get accounts error:", error)
    const message = error instanceof Error ? error.message : "Failed to fetch accounts"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

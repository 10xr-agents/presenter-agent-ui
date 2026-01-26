import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { userHasPassword } from "@/lib/utils/password-check"

// Force dynamic rendering - this layout uses headers() for session checking
export const dynamic = "force-dynamic"

export default async function SetPasswordLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  // If user already has a password, redirect to dashboard
  // This prevents infinite redirect loops
  const hasPassword = await userHasPassword(session.user.id)
  if (hasPassword) {
    redirect("/dashboard")
  }

  return <>{children}</>
}

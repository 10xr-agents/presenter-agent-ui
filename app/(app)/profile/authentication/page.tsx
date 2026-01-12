import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PasswordForm } from "@/components/settings/authentication/password-form"
import { auth } from "@/lib/auth"

export default async function ProfileAuthenticationPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Authentication</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Link your account to third-party authentication providers
        </p>
      </div>
      <PasswordForm />
    </div>
  )
}

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { PreferencesForm } from "@/components/settings/preferences/preferences-form"
import { auth } from "@/lib/auth"

export default async function ProfilePreferencesPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Preferences</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Theme, language, and notification preferences
        </p>
      </div>
      <PreferencesForm />
    </div>
  )
}

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
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Preferences</h1>
        <p className="mt-0.5 text-sm text-foreground">
          Theme, language, and notification preferences
        </p>
      </div>
      <PreferencesForm />
    </div>
  )
}

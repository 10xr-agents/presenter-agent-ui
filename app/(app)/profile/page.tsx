import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ProfileForm } from "@/components/settings/profile/profile-form"
import { auth } from "@/lib/auth"

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Profile</h1>
        <p className="mt-0.5 text-sm text-foreground">
          Manage your account information
        </p>
      </div>
      <ProfileForm />
    </div>
  )
}

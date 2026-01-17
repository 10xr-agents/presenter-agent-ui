"use client"

import { format } from "date-fns"
import { MoreVertical } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSession } from "@/lib/auth/client"
import { getTenantState } from "@/lib/utils/tenant-state"
import { toast } from "@/lib/utils/toast"

interface ConnectedAccount {
  provider: string
  email: string
  connectedAt: string
}

interface Team {
  id: string
  name: string
  role: string
  joinedAt: string
}

export function ProfileForm() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(session?.user?.name || "")
  const [email, setEmail] = useState(session?.user?.email || "")
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [tenantState, setTenantState] = useState<"normal" | "organization">("normal")

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "")
      setEmail(session.user.email || "")
    }
  }, [session])

  useEffect(() => {
    const fetchProfileData = async () => {
      setLoadingData(true)
      try {
        // Fetch tenant state
        const stateResponse = await fetch("/api/user/tenant-state")
        if (stateResponse.ok) {
          const stateData = (await stateResponse.json()) as { state?: "normal" | "organization" }
          setTenantState(stateData.state || "normal")
        }

        // Fetch connected accounts
        const accountsResponse = await fetch("/api/user/accounts")
        if (accountsResponse.ok) {
          const accountsData = (await accountsResponse.json()) as { accounts?: ConnectedAccount[] }
          setConnectedAccounts(accountsData.accounts || [])
        }

        // Fetch teams (only in organization mode)
        if (tenantState === "organization") {
          const teamsResponse = await fetch("/api/user/teams")
          if (teamsResponse.ok) {
            const teamsData = (await teamsResponse.json()) as { teams?: Team[] }
            setTeams(teamsData.teams || [])
          }
        }
      } catch (err: unknown) {
        console.error("Failed to fetch profile data:", err)
      } finally {
        setLoadingData(false)
      }
    }

    if (!isPending) {
      fetchProfileData()
    }
  }, [isPending, tenantState])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || "Failed to update profile")
      }

      toast.success("Profile updated successfully")
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update profile"
      setError(message)
      toast.error("Failed to update profile", message)
    } finally {
      setLoading(false)
    }
  }

  if (isPending || loadingData) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Your email */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Your email</CardTitle>
          <CardDescription className="text-xs">
            Manage your email address and authentication settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium">
                Email address
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={loading || true}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">
                Email changes require verification. Contact support if you need to change your email.
              </p>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={loading} size="sm">
                {loading ? (
                  <>
                    <Spinner className="mr-2 h-3.5 w-3.5" />
                    Updating...
                  </>
                ) : (
                  "Update email"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Invites */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Invites</CardTitle>
          <CardDescription className="text-xs">
            Manage team and organization invitations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">There are no pending invites.</p>
        </CardContent>
      </Card>

      {/* Teams (only in organization mode) */}
      {tenantState === "organization" && (
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Teams</CardTitle>
            <CardDescription className="text-xs">
              The teams that are associated with your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {teams.length > 0 ? (
              <div className="space-y-2">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between rounded-md border bg-background p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {team.name[0]?.toUpperCase() || "T"}
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{team.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Joined on {format(new Date(team.joinedAt), "MMMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                        {team.role}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem className="text-xs">View team</DropdownMenuItem>
                          <DropdownMenuItem className="text-xs">Leave team</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">You are not part of any teams.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Authentication */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Authentication</CardTitle>
          <CardDescription className="text-xs">
            Link your account to third-party authentication providers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {connectedAccounts.length > 0 && (
              <div className="space-y-2">
                {connectedAccounts.map((account) => (
                  <div
                    key={account.provider}
                    className="flex items-center justify-between rounded-md border bg-background p-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                        {account.provider[0]}
                      </div>
                      <div>
                        <p className="text-xs font-semibold capitalize">{account.provider}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.email} • Connected on{" "}
                          {format(new Date(account.connectedAt), "MMM d, yyyy")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                Link GitHub
              </Button>
              <Button variant="outline" size="sm">
                Link Google
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Multi-Factor Authentication */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Multi-Factor Authentication (MFA)</CardTitle>
          <CardDescription className="text-xs">
            Protect your account by adding an extra layer of security
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm">
            Enable MFA
          </Button>
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Card className="bg-muted/30 border-destructive/20">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-destructive">Delete Account</CardTitle>
          <CardDescription className="text-xs">
            {tenantState === "organization" ? (
              <>
                Accounts can only be deleted when there are no more teams still associated with it.
                Please leave all teams before deleting your account.
              </>
            ) : (
              "Permanently delete your account and all associated data. This action cannot be undone."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm">
            Delete Account
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

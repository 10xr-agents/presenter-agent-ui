"use client"

import { Loader2, Plus, Users } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TeamForm } from "./team-form"

interface Team {
  _id: string
  name: string
  description?: string
  organizationId: string
  createdAt: string
  updatedAt: string
}

interface TeamListProps {
  organizationId: string
  initialTeams?: Team[]
}

export function TeamList({
  organizationId,
  initialTeams = [],
}: TeamListProps) {
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [isLoading, setIsLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)

  useEffect(() => {
    // Fetch teams on mount if not provided
    if (initialTeams.length === 0) {
      fetchTeams()
    }
  }, [organizationId])

  const fetchTeams = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/teams?organizationId=${organizationId}`)
      if (!response.ok) throw new Error("Failed to fetch teams")

      const data = (await response.json()) as { teams?: Team[] }
      if (data.teams) {
        setTeams(data.teams)
      }
    } catch (error: unknown) {
      console.error("Fetch teams error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTeamCreated = () => {
    setCreateModalOpen(false)
    fetchTeams()
    router.refresh()
  }

  if (isLoading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Teams</h2>
          <p className="text-muted-foreground">
            Manage teams for your organization
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No teams yet</h3>
            <p className="mb-4 text-center text-muted-foreground">
              Create your first team to get started
            </p>
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link key={team._id} href={`/teams/${team._id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle>{team.name}</CardTitle>
                  {team.description && (
                    <CardDescription>{team.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    Created {new Date(team.createdAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <TeamForm
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        organizationId={organizationId}
        onSuccess={handleTeamCreated}
      />
    </div>
  )
}

"use client"

import { Plus, Users } from "lucide-react"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
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
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Teams</h2>
          <p className="text-xs text-muted-foreground">
            Manage teams for your organization
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="sm">
          <Plus className="mr-2 h-3.5 w-3.5" />
          Create Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold">No teams yet</EmptyTitle>
            <EmptyDescription className="text-xs">
              Create your first team to get started
            </EmptyDescription>
            <Button onClick={() => setCreateModalOpen(true)} size="sm" className="mt-4">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create Team
            </Button>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link key={team._id} href={`/teams/${team._id}`}>
              <Card className="bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
                    {team.name}
                  </CardTitle>
                  {team.description && (
                    <CardDescription className="text-xs line-clamp-2">
                      {team.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">
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

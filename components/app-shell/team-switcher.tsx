"use client"

import { Check, ChevronsUpDown, Plus } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth/client"
import { cn } from "@/lib/utils"

const { useSession } = authClient

interface Team {
  id: string
  name: string
  avatar?: string
}

export function TeamSwitcher() {
  const { data: session, isPending } = useSession()
  const [mounted, setMounted] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const fetchTeams = async () => {
      if (!session?.user) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch("/api/user/teams")
        if (response.ok) {
          const data = (await response.json()) as { teams?: Array<{ id: string; name: string }> }
          const fetchedTeams: Team[] = (data.teams || []).map((t) => ({
            id: t.id,
            name: t.name,
            avatar: undefined,
          }))

          // If no teams, use user's name as personal team
          if (fetchedTeams.length === 0 && session.user.name) {
            fetchedTeams.push({
              id: session.user.id || "personal",
              name: session.user.name,
              avatar: undefined,
            })
          }

          setTeams(fetchedTeams)
          // Set first team as selected if available
          if (fetchedTeams.length > 0 && !selectedTeam) {
            setSelectedTeam(fetchedTeams[0]!)
          }
        }
      } catch (error: unknown) {
        console.error("Failed to fetch teams:", error)
        // Fallback to user's name as personal team
        if (session.user.name) {
          const personalTeam: Team = {
            id: session.user.id || "personal",
            name: session.user.name,
            avatar: undefined,
          }
          setTeams([personalTeam])
          setSelectedTeam(personalTeam)
        }
      } finally {
        setLoading(false)
      }
    }

    if (!isPending && mounted) {
      fetchTeams()
    }
  }, [session, isPending, mounted, selectedTeam])

  if (!mounted || isPending || loading || !session?.user || !selectedTeam) {
    return (
      <div className="flex items-center gap-2 rounded-md px-2 py-2">
        <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded" />
      </div>
    )
  }

  const teamInitials = selectedTeam.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors",
            "hover:bg-zinc-100 dark:hover:bg-zinc-800",
            "text-zinc-900 dark:text-zinc-100",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          )}
        >
          <Avatar className="h-8 w-8 shrink-0 border border-zinc-200 dark:border-zinc-800">
            <AvatarImage src={selectedTeam.avatar} alt={selectedTeam.name} />
            <AvatarFallback className="text-xs font-medium bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
              {teamInitials}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 text-left leading-snug">{selectedTeam.name}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Teams
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {teams.length > 0 ? (
          teams.map((team) => {
            const initials = team.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)
            const isActive = team.id === selectedTeam.id

            return (
              <DropdownMenuItem
                key={team.id}
                onSelect={() => {
                  setSelectedTeam(team)
                  // Team switching is handled by setting the selected team
                  // Actual organization/team context switching would be implemented via API
                }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Avatar className="h-6 w-6 border border-zinc-200 dark:border-zinc-800">
                  <AvatarImage src={team.avatar} alt={team.name} />
                  <AvatarFallback className="text-xs bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1">{team.name}</span>
                {isActive && <Check className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />}
              </DropdownMenuItem>
            )
          })
        ) : (
          <DropdownMenuItem disabled>
            <span className="text-xs text-muted-foreground">No teams available</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/organization/create" className="flex items-center cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Create Team
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

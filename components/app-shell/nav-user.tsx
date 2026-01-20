"use client"

import { LogOut, Moon, MoreHorizontal, Settings, Sun, User } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth/client"

const { signOut, useSession } = authClient

export function NavUser() {
  const router = useRouter()
  const { data: session, isPending } = useSession()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    router.push("/login")
    router.refresh()
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  if (!mounted || isPending || !session?.user) {
    return (
      <div className="flex items-center gap-2 rounded-md px-2 py-2">
        <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded" />
      </div>
    )
  }

  const user = session.user
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email?.[0]?.toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={user.image || undefined} alt={user.name || user.email || "User"} />
            <AvatarFallback className="text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col items-start text-left">
            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[120px]">
              {user.name || "User"}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[120px]">
              {user.email}
            </span>
          </div>
          <MoreHorizontal className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center">
            <User className="mr-2 h-4 w-4" />
            My profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={toggleTheme}
          className="cursor-pointer"
        >
          {theme === "dark" ? (
            <Sun className="mr-2 h-4 w-4" />
          ) : (
            <Moon className="mr-2 h-4 w-4" />
          )}
          Toggle theme
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleSignOut} 
          className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300 focus:bg-red-50 dark:focus:bg-red-950/20 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

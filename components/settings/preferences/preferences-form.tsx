"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/lib/utils/toast"

export function PreferencesForm() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState({
    theme: theme || "system",
    language: "en",
    emailNotifications: true,
    inAppNotifications: true,
  })

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await fetch("/api/user/preferences")
        if (response.ok) {
          const data = (await response.json()) as {
            preferences?: {
              theme?: string
              language?: string
              emailNotifications?: boolean
              inAppNotifications?: boolean
            }
          }
          if (data.preferences) {
            setPreferences((prev) => ({ ...prev, ...data.preferences }))
          }
        }
      } catch (err: unknown) {
        console.error("Error loading preferences:", err)
      }
    }

    loadPreferences()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || "Failed to update preferences")
      }

      setTheme(preferences.theme)

      toast.success("Preferences updated successfully")
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update preferences"
      setError(message)
      toast.error("Failed to update preferences", message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="theme" className="text-xs text-muted-foreground">
            Theme
          </Label>
          <Select
            value={preferences.theme}
            onValueChange={(value) =>
              setPreferences({ ...preferences, theme: value })
            }
            disabled={loading}
          >
            <SelectTrigger id="theme" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choose your preferred color theme
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="language" className="text-xs text-muted-foreground">
            Language
          </Label>
          <Select
            value={preferences.language}
            onValueChange={(value) =>
              setPreferences({ ...preferences, language: value })
            }
            disabled={loading}
          >
            <SelectTrigger id="language" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Select your preferred language
          </p>
        </div>

        <div className="space-y-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="emailNotifications" className="text-xs text-muted-foreground">
                Email Notifications
              </Label>
              <p className="text-xs text-muted-foreground">
                Receive email notifications for important updates
              </p>
            </div>
            <Switch
              id="emailNotifications"
              checked={preferences.emailNotifications}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, emailNotifications: checked })
              }
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="inAppNotifications" className="text-xs text-muted-foreground">
                In-App Notifications
              </Label>
              <p className="text-xs text-muted-foreground">
                Show notifications within the application
              </p>
            </div>
            <Switch
              id="inAppNotifications"
              checked={preferences.inAppNotifications}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, inAppNotifications: checked })
              }
              disabled={loading}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={loading} size="sm">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            "Save preferences"
          )}
        </Button>
      </div>
    </form>
  )
}

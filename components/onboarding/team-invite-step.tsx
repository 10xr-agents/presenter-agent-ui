"use client"

import { AlertCircle, Loader2, Mail, Plus, X } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TeamInviteStepProps {
  onNext: () => void
  onSkip: () => void
}

export function TeamInviteStep({ onNext, onSkip }: TeamInviteStepProps) {
  const [emails, setEmails] = useState<string[]>([])
  const [currentEmail, setCurrentEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }

  const handleAddEmail = () => {
    const trimmedEmail = currentEmail.trim()
    if (!trimmedEmail) return

    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address")
      return
    }

    if (emails.includes(trimmedEmail)) {
      setError("Email already added")
      return
    }

    setEmails([...emails, trimmedEmail])
    setCurrentEmail("")
    setError(null)
  }

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter((email) => email !== emailToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddEmail()
    }
  }

  const handleSkip = () => {
    onSkip()
  }

  const handleNext = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // TODO: Send invitation emails
      // For now, just proceed to next step
      // In production, you would:
      // 1. Call API to send invitations
      // 2. Create pending organization memberships
      // 3. Show success message

      if (emails.length > 0) {
        // TODO: Implement invitation API call
        // await fetch("/api/organizations/invite", {
        //   method: "POST",
        //   headers: { "Content-Type": "application/json" },
        //   body: JSON.stringify({ emails }),
        // })
      }

      onNext()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send invitations"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">Invite Team Members</h2>
        <p className="text-muted-foreground">
          Add your team members to get started. You can skip this step and invite them later.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <div className="flex gap-2">
            <Input
              id="email"
              type="email"
              placeholder="colleague@example.com"
              value={currentEmail}
              onChange={(e) => setCurrentEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <Button type="button" onClick={handleAddEmail} disabled={isLoading || !currentEmail.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {emails.length > 0 && (
          <div className="space-y-2">
            <Label>Team Members to Invite</Label>
            <div className="space-y-2 rounded-lg border p-4">
              {emails.map((email) => (
                <div key={email} className="flex items-center justify-between rounded-md bg-muted p-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{email}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveEmail(email)}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between gap-4">
        <Button type="button" variant="outline" onClick={handleSkip} disabled={isLoading}>
          Skip
        </Button>
        <Button type="button" onClick={handleNext} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </div>
  )
}

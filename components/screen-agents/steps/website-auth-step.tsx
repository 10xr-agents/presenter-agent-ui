"use client"

import { Lock, Shield } from "lucide-react"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import type { WizardData } from "@/hooks/use-screen-agent-wizard"

interface WebsiteAuthStepProps {
  data: WizardData
  onUpdate: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrevious: () => void
}

export function WebsiteAuthStep({
  data,
  onUpdate,
  onNext,
  onPrevious,
}: WebsiteAuthStepProps) {
  const [username, setUsername] = useState(data.websiteCredentials?.username || "")
  const [password, setPassword] = useState(data.websiteCredentials?.password || "")
  const [skip, setSkip] = useState(!data.websiteCredentials)

  const handleNext = () => {
    if (!skip) {
      onUpdate({
        websiteCredentials: {
          username,
          password,
        },
      })
    } else {
      onUpdate({
        websiteCredentials: undefined,
      })
    }
    onNext()
  }

  const handleSkip = () => {
    setSkip(true)
    setUsername("")
    setPassword("")
    onNext()
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Security Note:</strong> These credentials are encrypted and only used by your
          Screen Agent. We recommend creating a dedicated demo account for this purpose.
        </AlertDescription>
      </Alert>

      {!skip ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="username" className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Username
            </Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="demo@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Username or email for website authentication
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
            <p className="text-xs text-muted-foreground">
              Password for website authentication (without 2FA/OTP)
            </p>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <p>Website authentication skipped.</p>
          <p className="text-sm mt-2">
            You can add credentials later if your website requires authentication.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious}>
          Previous
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSkip}>
            {skip ? "Add Credentials" : "Skip"}
          </Button>
          {!skip && (
            <Button onClick={handleNext}>
              Next: Knowledge Upload
            </Button>
          )}
          {skip && (
            <Button onClick={() => setSkip(false)}>
              Next: Knowledge Upload
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

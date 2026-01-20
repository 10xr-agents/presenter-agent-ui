"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useState, useEffect, useRef } from "react"

interface BasicInformationStepProps {
  name: string
  description: string
  sourceName: string
  websiteUrl: string
  username: string
  password: string
  loginUrl: string
  skipAuthentication: boolean
  onUpdate: (data: {
    name: string
    description: string
    sourceName: string
    websiteUrl: string
    username: string
    password: string
    loginUrl: string
    skipAuthentication: boolean
  }) => void
  urlError: string | null
  onUrlError: (error: string | null) => void
}

export function BasicInformationStep({
  name,
  description,
  sourceName,
  websiteUrl,
  username,
  password,
  loginUrl,
  skipAuthentication,
  onUpdate,
  urlError,
  onUrlError,
}: BasicInformationStepProps) {
  const [localName, setLocalName] = useState(name)
  const [localDescription, setLocalDescription] = useState(description)
  const [localSourceName, setLocalSourceName] = useState(sourceName)
  const [localWebsiteUrl, setLocalWebsiteUrl] = useState(websiteUrl)
  const [localUsername, setLocalUsername] = useState(username)
  const [localPassword, setLocalPassword] = useState(password)
  const [localLoginUrl, setLocalLoginUrl] = useState(loginUrl)
  const [localSkipAuth, setLocalSkipAuth] = useState(skipAuthentication)

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      onUrlError("Website URL is required")
      return false
    }
    try {
      const urlObj = new URL(url)
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        onUrlError("URL must start with http:// or https://")
        return false
      }
      onUrlError(null)
      return true
    } catch {
      onUrlError("Please enter a valid URL (e.g., https://example.com)")
      return false
    }
  }

  const handleUrlChange = (value: string) => {
    setLocalWebsiteUrl(value)
    if (value.trim()) {
      validateUrl(value)
    } else {
      onUrlError(null)
    }
  }

  // Update parent on change - use ref to prevent infinite loops
  const prevValuesRef = useRef({
    name: localName,
    description: localDescription,
    sourceName: localSourceName,
    websiteUrl: localWebsiteUrl,
    username: localUsername,
    password: localPassword,
    loginUrl: localLoginUrl,
    skipAuthentication: localSkipAuth,
  })

  useEffect(() => {
    const currentValues = {
      name: localName,
      description: localDescription,
      sourceName: localSourceName,
      websiteUrl: localWebsiteUrl,
      username: localUsername,
      password: localPassword,
      loginUrl: localLoginUrl,
      skipAuthentication: localSkipAuth,
    }

    // Only update if values actually changed
    const hasChanged = 
      prevValuesRef.current.name !== currentValues.name ||
      prevValuesRef.current.description !== currentValues.description ||
      prevValuesRef.current.sourceName !== currentValues.sourceName ||
      prevValuesRef.current.websiteUrl !== currentValues.websiteUrl ||
      prevValuesRef.current.username !== currentValues.username ||
      prevValuesRef.current.password !== currentValues.password ||
      prevValuesRef.current.loginUrl !== currentValues.loginUrl ||
      prevValuesRef.current.skipAuthentication !== currentValues.skipAuthentication

    if (hasChanged) {
      prevValuesRef.current = currentValues
      onUpdate(currentValues)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localName, localDescription, localSourceName, localWebsiteUrl, localUsername, localPassword, localLoginUrl, localSkipAuth])

  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-6 space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Basic Information</h3>
          <p className="mt-0.5 text-xs text-foreground">
            Provide a name and description for this knowledge source
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id="name"
            type="text"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder="SpadeWorks Website"
            className="h-9"
          />
          <p className="text-xs text-foreground">
            A friendly name for this knowledge source
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs text-muted-foreground">
            Description
          </Label>
          <textarea
            id="description"
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            placeholder="Brief description of this knowledge source"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            rows={3}
          />
          <p className="text-xs text-foreground">
            Optional description to help identify this knowledge source
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sourceName" className="text-xs text-muted-foreground">
            Source Name
          </Label>
          <Input
            id="sourceName"
            type="text"
            value={localSourceName}
            onChange={(e) => setLocalSourceName(e.target.value)}
            placeholder="Optional: Custom name for this source"
            className="h-9"
          />
          <p className="text-xs text-foreground">
            Optional internal identifier for this source
          </p>
        </div>
      </div>

      <Separator />

      {/* Website Source */}
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Website Source</h3>
          <p className="mt-0.5 text-xs text-foreground">
            The primary website to extract knowledge from (required)
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="websiteUrl" className="text-xs text-muted-foreground">
            Website URL *
          </Label>
          <Input
            id="websiteUrl"
            type="url"
            value={localWebsiteUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://example.com"
            className={urlError ? "h-9 border-destructive" : "h-9"}
            required
          />
          {urlError && (
            <p className="text-xs text-destructive">{urlError}</p>
          )}
          <p className="text-xs text-foreground">
            The website to extract knowledge from
          </p>
        </div>
      </div>

      <Separator />

      {/* Authentication */}
      <div className="space-y-4">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">Authentication</h3>
          <p className="mt-0.5 text-xs text-foreground">
            Optional. Most websites can be processed without credentials.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            type="button"
            variant={localSkipAuth ? "outline" : "default"}
            size="sm"
            onClick={() => {
              setLocalSkipAuth(!localSkipAuth)
              if (!localSkipAuth) {
                setLocalUsername("")
                setLocalPassword("")
                setLocalLoginUrl("")
              }
            }}
          >
            {localSkipAuth ? "Add Credentials" : "Skip Authentication"}
          </Button>

          {!localSkipAuth && (
            <Card className="bg-muted/30">
              <CardContent className="pt-6 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs text-muted-foreground">
                    Username
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    value={localUsername}
                    onChange={(e) => setLocalUsername(e.target.value)}
                    placeholder="username"
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs text-muted-foreground">
                    Password
                  </Label>
                  <PasswordInput
                    id="password"
                    value={localPassword}
                    onChange={(e) => setLocalPassword(e.target.value)}
                    placeholder="password"
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="loginUrl" className="text-xs text-muted-foreground">
                    Login URL (Optional)
                  </Label>
                  <Input
                    id="loginUrl"
                    type="url"
                    value={localLoginUrl}
                    onChange={(e) => setLocalLoginUrl(e.target.value)}
                    placeholder="https://example.com/login"
                    className="h-9"
                  />
                  <p className="text-xs text-foreground">
                    Custom login page URL if different from website URL
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </CardContent>
    </Card>
  )
}

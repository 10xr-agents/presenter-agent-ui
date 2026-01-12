"use client"

import { AlertCircle, Loader2, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface AutoReloadSettingsProps {
  organizationId: string
  enabled: boolean
  thresholdCents: number
  amountCents: number
}

export function AutoReloadSettings({
  organizationId,
  enabled: initialEnabled,
  thresholdCents: initialThresholdCents,
  amountCents: initialAmountCents,
}: AutoReloadSettingsProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(initialEnabled)
  const [threshold, setThreshold] = useState((initialThresholdCents / 100).toString())
  const [amount, setAmount] = useState((initialAmountCents / 100).toString())

  const handleSave = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const thresholdCents = Math.round(parseFloat(threshold) * 100)
      const amountCents = Math.round(parseFloat(amount) * 100)

      if (thresholdCents <= 0 || amountCents <= 0) {
        setError("Threshold and amount must be greater than $0")
        setIsLoading(false)
        return
      }

      if (amountCents < 10000) {
        setError("Auto-reload amount must be at least $100")
        setIsLoading(false)
        return
      }

      const response = await fetch("/api/billing/auto-reload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          enabled,
          thresholdCents,
          amountCents,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to update auto-reload settings")
      }

      router.refresh()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update settings"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Header - Resend style: compact */}
          <div>
            <h3 className="text-sm font-semibold mb-0.5">Auto-Reload Settings</h3>
            <p className="text-xs text-muted-foreground">
              Automatically reload your account when balance drops below threshold
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-3.5 w-3.5" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Enable Toggle - Resend style: compact */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-reload-enabled" className="text-xs text-muted-foreground">
                Enable Auto-Reload
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically charge your payment method when balance is low
              </p>
            </div>
            <Switch
              id="auto-reload-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={isLoading}
            />
          </div>

          {enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="threshold" className="text-xs text-muted-foreground">
                  Threshold (USD) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="threshold"
                  type="number"
                  min="1"
                  step="0.01"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="10.00"
                  disabled={isLoading}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">
                  Balance threshold to trigger auto-reload (default: $10)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount" className="text-xs text-muted-foreground">
                  Reload Amount (USD) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min="100"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100"
                  disabled={isLoading}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">
                  Amount to reload when threshold is reached (minimum: $100)
                </p>
              </div>

              <Alert className="py-2">
                <AlertCircle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">
                  Auto-reload requires a valid payment method. Make sure you have a payment method
                  configured before enabling this feature.
                </AlertDescription>
              </Alert>
            </>
          )}

          <Button onClick={handleSave} disabled={isLoading} size="sm" className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-3.5 w-3.5" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

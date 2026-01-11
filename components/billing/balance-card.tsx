"use client"

import { AlertCircle, CreditCard, Loader2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface BalanceCardProps {
  organizationId: string
  balanceCents: number
  currencyCode?: string
  primaryPaymentMethod?: {
    type: string
    lastFour?: string
    cardBrand?: string
  }
  autoReloadEnabled?: boolean
  autoReloadThresholdCents?: number
  autoReloadAmountCents?: number
}

export function BalanceCard({
  organizationId,
  balanceCents,
  currencyCode = "USD",
  primaryPaymentMethod,
  autoReloadEnabled = false,
  autoReloadThresholdCents = 1000,
  autoReloadAmountCents = 10000,
}: BalanceCardProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [amount, setAmount] = useState("100")

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
    }).format(cents / 100)
  }

  const handleAddBalance = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const amountCents = Math.round(parseFloat(amount) * 100)

      if (amountCents < 10000) {
        setError("Minimum amount is $100")
        setIsLoading(false)
        return
      }

      // TODO: Integrate with Stripe Payment Element or Checkout
      // For now, this is a placeholder
      // In production, you would:
      // 1. Create a Setup Intent or Payment Intent
      // 2. Use Stripe Elements to collect payment method
      // 3. Confirm payment and add balance

      const response = await fetch("/api/billing/add-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          amountCents,
          paymentMethodId: "pm_placeholder", // TODO: Get from Stripe Elements
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to add balance")
      }

      // Refresh page to show new balance
      router.refresh()
      setDialogOpen(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add balance"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const isLowBalance = balanceCents < autoReloadThresholdCents * 2

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Account Balance</span>
          <Badge variant={isLowBalance ? "destructive" : "default"}>
            {isLowBalance ? "Low Balance" : "Active"}
          </Badge>
        </CardTitle>
        <CardDescription>Pay-as-you-go billing account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-3xl font-bold">{formatCurrency(balanceCents)}</div>
          <p className="text-sm text-muted-foreground mt-1">Current balance</p>
        </div>

        {isLowBalance && (
          <Alert variant={balanceCents < autoReloadThresholdCents ? "destructive" : "default"}>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {balanceCents < autoReloadThresholdCents
                ? "Your balance is below the auto-reload threshold. Please add funds."
                : "Your balance is low. Consider adding funds to avoid service interruption."}
            </AlertDescription>
          </Alert>
        )}

        {primaryPaymentMethod && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {primaryPaymentMethod.cardBrand?.toUpperCase()} •••• {primaryPaymentMethod.lastFour}
            </span>
          </div>
        )}

        {autoReloadEnabled && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-1">Auto-Reload</p>
            <p className="text-xs text-muted-foreground">
              Enabled: Reload ${(autoReloadAmountCents / 100).toFixed(2)} when balance drops
              below ${(autoReloadThresholdCents / 100).toFixed(2)}
            </p>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" variant={isLowBalance ? "default" : "outline"}>
              <Plus className="mr-2 h-4 w-4" />
              Add Balance
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Balance</DialogTitle>
              <DialogDescription>
                Add funds to your pay-as-you-go account. Minimum amount is $100.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (USD)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="100"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100"
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum: $100. Recommended: $100, $250, $500, $1000
                </p>
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <div className="p-4 border rounded-lg bg-muted">
                  <p className="text-sm text-muted-foreground">
                    Payment method integration will be completed in a future phase.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This requires Stripe Payment Elements integration.
                  </p>
                </div>
              </div>

              <Button
                onClick={handleAddBalance}
                disabled={isLoading || !amount || parseFloat(amount) < 100}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Add ${amount || "0"}
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

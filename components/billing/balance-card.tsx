"use client"

import { AlertCircle, CreditCard, Loader2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

      const response = await fetch("/api/billing/add-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          amountCents,
          paymentMethodId: "pm_placeholder",
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || "Failed to add balance")
      }

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
    <Card className="bg-muted/30">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Header - Resend style: compact */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold mb-0.5">Account Balance</h3>
              <p className="text-xs text-muted-foreground">Pay-as-you-go billing account</p>
            </div>
            <Badge variant={isLowBalance ? "destructive" : "default"} className="text-xs">
              {isLowBalance ? "Low" : "Active"}
            </Badge>
          </div>

          {/* Balance - Resend style: smaller, restrained */}
          <div>
            <div className="text-2xl font-semibold">{formatCurrency(balanceCents)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Current balance</p>
          </div>

          {/* Low Balance Alert - Resend style: compact */}
          {isLowBalance && (
            <Alert
              variant={balanceCents < autoReloadThresholdCents ? "destructive" : "default"}
              className="py-2"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <AlertDescription className="text-xs">
                {balanceCents < autoReloadThresholdCents
                  ? "Balance below threshold. Please add funds."
                  : "Balance is low. Consider adding funds."}
              </AlertDescription>
            </Alert>
          )}

          {/* Payment Method - Resend style: subtle */}
          {primaryPaymentMethod && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {primaryPaymentMethod.cardBrand?.toUpperCase()} •••• {primaryPaymentMethod.lastFour}
              </span>
            </div>
          )}

          {/* Auto-Reload Status - Resend style: subtle */}
          {autoReloadEnabled && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium mb-0.5">Auto-Reload</p>
              <p className="text-xs text-muted-foreground">
                Reload ${(autoReloadAmountCents / 100).toFixed(2)} when balance drops below $
                {(autoReloadThresholdCents / 100).toFixed(2)}
              </p>
            </div>
          )}

          {/* Add Balance Button - Resend style: compact */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant={isLowBalance ? "default" : "outline"}
                size="sm"
                className="w-full"
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Balance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-base">Add Balance</DialogTitle>
                <DialogDescription className="text-sm">
                  Add funds to your pay-as-you-go account. Minimum amount is $100.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="py-2">
                    <AlertDescription className="text-sm">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-xs text-muted-foreground">
                    Amount (USD)
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
                    Minimum: $100. Recommended: $100, $250, $500, $1000
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Payment Method</Label>
                  <div className="p-3 border rounded-md bg-muted/30">
                    <p className="text-xs text-muted-foreground">
                      Payment method integration will be completed in a future phase.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={handleAddBalance}
                  disabled={isLoading || !amount || parseFloat(amount) < 100}
                  size="sm"
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-3.5 w-3.5" />
                      Add ${amount || "0"}
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}

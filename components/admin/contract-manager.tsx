"use client"

import { formatDistanceToNow } from "date-fns"
import { FileText, Plus } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Contract {
  id: string
  organizationId: string
  contractStartDate: Date
  contractEndDate: Date
  committedUsageMinutes: number
  ratePerMinuteCents: number
  overageRatePerMinuteCents: number
  paymentTerms: string
  invoiceFrequency: "monthly" | "quarterly" | "annual"
  billingEmailAddresses: string[]
  createdAt: Date
  updatedAt: Date
}

interface ContractsResponse {
  contracts: Contract[]
  total: number
}

export function ContractManager() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchContracts = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/admin/contracts")
        const result = (await response.json()) as ContractsResponse | { error: string }
        if (!response.ok) {
          throw new Error((result as { error: string }).error || "Failed to fetch contracts")
        }
        setContracts((result as ContractsResponse).contracts)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An unknown error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchContracts()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="h-8 w-8" />
        <p className="ml-2 text-lg">Loading contracts...</p>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Enterprise Contracts</h1>
          <p className="text-muted-foreground mt-2">Manage enterprise billing contracts</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Contract
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No enterprise contracts found.
            </div>
          ) : (
            <div className="space-y-4">
              {contracts.map((contract) => (
                <Card key={contract.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <h3 className="text-lg font-semibold">Enterprise Contract</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Organization: {contract.organizationId}
                        </p>
                        <div className="flex items-center space-x-4 mt-4">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Start:</span>{" "}
                            <span className="font-medium">
                              {new Date(contract.contractStartDate).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">End:</span>{" "}
                            <span className="font-medium">
                              {new Date(contract.contractEndDate).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Rate/Min:</span>{" "}
                            <span className="font-medium">
                              ${(contract.ratePerMinuteCents / 100).toFixed(2)}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Frequency:</span>{" "}
                            <span className="font-medium">{contract.invoiceFrequency}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 mt-2">
                          <div className="text-sm">
                            <span className="text-muted-foreground">Committed Minutes:</span>{" "}
                            <span className="font-medium">{contract.committedUsageMinutes}</span>
                          </div>
                          <div className="text-sm">
                            <span className="text-muted-foreground">Payment Terms:</span>{" "}
                            <span className="font-medium">{contract.paymentTerms}</span>
                          </div>
                        </div>
                        {contract.billingEmailAddresses.length > 0 && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            Billing Emails: {contract.billingEmailAddresses.join(", ")}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Created {formatDistanceToNow(new Date(contract.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

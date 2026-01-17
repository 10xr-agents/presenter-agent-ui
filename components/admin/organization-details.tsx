"use client"

import { formatDistanceToNow } from "date-fns"
import { ArrowLeft, DollarSign, Layers, Users } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface OrganizationDetailsData {
  organization: {
    id: string
    name: string
    slug: string
    logo?: string | null
    createdAt: Date
    metadata?: string | null
  }
  members: Array<{
    id: string
    userId: string
    role: string
    createdAt: Date
    user: {
      id: string
      name: string
      email: string
      emailVerified: boolean
    }
  }>
  billingAccount: {
    id: string
    balanceCents: number
    billingType: string
    status: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enterpriseContract?: any
    autoReloadEnabled: boolean
  } | null
  screenAgents: Array<{
    id: string
    name: string
    status: string
    createdAt: Date
  }>
  usageStats: {
    totalMinutes: number
    totalCost: number
    eventCount: number
    recentUsage: Array<{
      id: string
      eventType: string
      quantity: number
      totalCostCents: number
      eventTimestamp: Date
    }>
  }
}

interface OrganizationDetailsProps {
  organizationId: string
}

export function OrganizationDetails({ organizationId }: OrganizationDetailsProps) {
  const [data, setData] = useState<OrganizationDetailsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/admin/organizations/${organizationId}`)
        const result = (await response.json()) as OrganizationDetailsData | { error: string }
        if (!response.ok) {
          throw new Error((result as { error: string }).error || "Failed to fetch organization")
        }
        setData(result as OrganizationDetailsData)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An unknown error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [organizationId])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="h-8 w-8" />
        <p className="ml-2 text-lg">Loading organization details...</p>
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

  if (!data) {
    return (
      <Alert>
        <AlertTitle>Not Found</AlertTitle>
        <AlertDescription>Organization not found.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/platform/organizations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">{data.organization.name}</h1>
          <p className="text-muted-foreground mt-1">
            Created {formatDistanceToNow(new Date(data.organization.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.members.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Screen Agents</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.screenAgents.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Usage Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.usageStats.totalCost.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Billing Account</CardTitle>
          </CardHeader>
          <CardContent>
            {data.billingAccount ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Balance:</span>
                  <span className="font-medium">
                    ${(data.billingAccount.balanceCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-medium">{data.billingAccount.billingType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium">{data.billingAccount.status}</span>
                </div>
                {data.billingAccount.enterpriseContract && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Enterprise Contract</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Start Date:</span>
                        <span>{new Date(data.billingAccount.enterpriseContract.contractStartDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">End Date:</span>
                        <span>{new Date(data.billingAccount.enterpriseContract.contractEndDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Committed Minutes:</span>
                        <span>{data.billingAccount.enterpriseContract.committedUsageMinutes}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rate/Min:</span>
                        <span>${(data.billingAccount.enterpriseContract.ratePerMinuteCents / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Invoice Frequency:</span>
                        <span>{data.billingAccount.enterpriseContract.invoiceFrequency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payment Terms:</span>
                        <span>{data.billingAccount.enterpriseContract.paymentTerms}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">No billing account found.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage Statistics (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Minutes:</span>
                <span className="font-medium">{data.usageStats.totalMinutes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Cost:</span>
                <span className="font-medium">${data.usageStats.totalCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Event Count:</span>
                <span className="font-medium">{data.usageStats.eventCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.members.map((member) => (
              <div key={member.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium">{member.user.name}</p>
                  <p className="text-sm text-muted-foreground">{member.user.email}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">{member.role}</span>
                  {!member.user.emailVerified && (
                    <p className="text-xs text-muted-foreground">Unverified</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Usage Events</CardTitle>
        </CardHeader>
        <CardContent>
          {data.usageStats.recentUsage.length === 0 ? (
            <p className="text-muted-foreground">No usage events found.</p>
          ) : (
            <div className="space-y-2">
              {data.usageStats.recentUsage.map((event) => (
                <div key={event.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{event.eventType}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(event.eventTimestamp), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">Qty: {event.quantity}</p>
                    <p className="text-sm text-muted-foreground">
                      ${(event.totalCostCents / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

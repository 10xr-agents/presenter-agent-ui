"use client"

import { formatDistanceToNow } from "date-fns"
import { DollarSign, ExternalLink, Layers, Search, Users } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

interface Organization {
  id: string
  name: string
  slug: string
  logo?: string | null
  createdAt: Date
  memberCount: number
  ownerCount: number
  screenAgentCount: number
  billingAccount: {
    balanceCents: number
    billingType: string
    status: string
  } | null
  usageStats: {
    totalMinutes: number
    totalCost: number
    eventCount: number
  }
}

interface OrganizationsResponse {
  organizations: Organization[]
  total: number
  limit: number
  offset: number
}

export function OrganizationManager() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const fetchOrganizations = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search) {
        params.set("search", search)
      }
      const response = await fetch(`/api/admin/organizations?${params.toString()}`)
      const result = (await response.json()) as OrganizationsResponse | { error: string }
      if (!response.ok) {
        throw new Error((result as { error: string }).error || "Failed to fetch organizations")
      }
      setOrganizations((result as OrganizationsResponse).organizations)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrganizations()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchOrganizations()
  }

  if (loading && organizations.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner className="h-8 w-8" />
        <p className="ml-2 text-lg">Loading organizations...</p>
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
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="text-muted-foreground mt-2">Manage all platform organizations</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <form onSubmit={handleSearch} className="flex items-center space-x-2">
            <Input
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button type="submit" variant="outline" size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No organizations found.</div>
          ) : (
            <div className="space-y-4">
              {organizations.map((org) => (
                <Card key={org.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-semibold">{org.name}</h3>
                          <span className="text-sm text-muted-foreground">({org.slug})</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Created {formatDistanceToNow(new Date(org.createdAt), { addSuffix: true })}
                        </p>
                        <div className="flex items-center space-x-4 mt-4">
                          <div className="flex items-center space-x-1 text-sm">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{org.memberCount} members</span>
                          </div>
                          <div className="flex items-center space-x-1 text-sm">
                            <Layers className="h-4 w-4 text-muted-foreground" />
                            <span>{org.screenAgentCount} agents</span>
                          </div>
                          <div className="flex items-center space-x-1 text-sm">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span>${(org.usageStats.totalCost || 0).toFixed(2)}</span>
                          </div>
                        </div>
                        {org.billingAccount && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            Balance: ${(org.billingAccount.balanceCents / 100).toFixed(2)} | Type:{" "}
                            {org.billingAccount.billingType} | Status: {org.billingAccount.status}
                          </div>
                        )}
                      </div>
                      <Link href={`/platform/organizations/${org.id}`}>
                        <Button variant="outline" size="sm">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Details
                        </Button>
                      </Link>
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

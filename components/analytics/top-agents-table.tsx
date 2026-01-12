"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AdvancedTable, type Column } from "@/components/ui/advanced-table"

interface TopAgent {
  id: string
  name: string
  sessionCount: number
  minutesConsumed: number
}

interface TopAgentsTableProps {
  agents: TopAgent[]
}

export function TopAgentsTable({ agents }: TopAgentsTableProps) {
  const columns: Column<TopAgent>[] = [
    {
      id: "name",
      header: "Agent Name",
      accessorKey: "name",
      sortable: true,
      filterable: true,
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      id: "sessions",
      header: "Sessions",
      accessorKey: "sessionCount",
      sortable: true,
      cell: (row) => <span className="text-right">{row.sessionCount}</span>,
    },
    {
      id: "minutes",
      header: "Minutes",
      accessorKey: "minutesConsumed",
      sortable: true,
      cell: (row) => <span className="text-right">{row.minutesConsumed}</span>,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Agents</CardTitle>
        <CardDescription>Most active screen agents by session count</CardDescription>
      </CardHeader>
      <CardContent>
        <AdvancedTable
          data={agents}
          columns={columns}
          searchable
          searchPlaceholder="Search agents..."
          emptyMessage="No agents found"
        />
      </CardContent>
    </Card>
  )
}

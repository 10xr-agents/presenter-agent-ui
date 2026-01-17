"use client"

import { AdvancedTable, type Column } from "@/components/ui/advanced-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
      header: "Agent",
      accessorKey: "name",
      sortable: true,
      filterable: true,
      cell: (row) => <span className="text-sm font-medium">{row.name}</span>,
    },
    {
      id: "sessions",
      header: "Sessions",
      accessorKey: "sessionCount",
      sortable: true,
      cell: (row) => <span className="text-sm text-right">{row.sessionCount}</span>,
    },
    {
      id: "minutes",
      header: "Minutes",
      accessorKey: "minutesConsumed",
      sortable: true,
      cell: (row) => <span className="text-sm text-right">{row.minutesConsumed}</span>,
    },
  ]

  return (
    <Card className="bg-muted/30">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Top Agents</CardTitle>
        <CardDescription className="text-xs">
          Most active screen agents by session count
        </CardDescription>
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

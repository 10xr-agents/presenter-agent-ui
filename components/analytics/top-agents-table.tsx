"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Agents</CardTitle>
          <CardDescription>Most active screen agents</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No agents found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Agents</CardTitle>
        <CardDescription>Most active screen agents by session count</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent Name</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Minutes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => (
              <TableRow key={agent.id}>
                <TableCell className="font-medium">{agent.name}</TableCell>
                <TableCell className="text-right">{agent.sessionCount}</TableCell>
                <TableCell className="text-right">{agent.minutesConsumed}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

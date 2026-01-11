"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface UsageChartProps {
  data: Array<{
    date: string
    minutes: number
    sessions: number
  }>
}

/**
 * Usage Chart Component
 * 
 * TODO: Implement actual chart using a charting library (e.g., Recharts, Chart.js)
 * 
 * For now, this is a placeholder component that displays data in a simple format.
 * To implement:
 * 1. Install charting library: pnpm add recharts (or chart.js)
 * 2. Replace placeholder with actual chart component
 */
export function UsageChart({ data }: UsageChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Over Time</CardTitle>
        <CardDescription>Minutes and sessions consumed over the selected period</CardDescription>
      </CardHeader>
      <CardContent>
        {/* TODO: Implement actual chart */}
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          Chart visualization placeholder
          <br />
          Install recharts or chart.js to display usage data
        </div>
        {/* Example with Recharts:
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="minutes" stroke="#8884d8" name="Minutes" />
            <Line yAxisId="right" type="monotone" dataKey="sessions" stroke="#82ca9d" name="Sessions" />
          </LineChart>
        </ResponsiveContainer>
        */}
      </CardContent>
    </Card>
  )
}

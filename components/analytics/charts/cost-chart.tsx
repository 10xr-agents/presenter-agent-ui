"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

interface CostChartProps {
  data: Array<{
    date: string
    cost: number
  }>
}

/**
 * Cost Chart Component
 * 
 * TODO: Implement actual chart using a charting library (e.g., Recharts, Chart.js)
 * 
 * For now, this is a placeholder component.
 * To implement:
 * 1. Install charting library: pnpm add recharts (or chart.js)
 * 2. Replace placeholder with actual chart component
 */
export function CostChart({ data }: CostChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Costs Over Time</CardTitle>
        <CardDescription>Spending over the selected period</CardDescription>
      </CardHeader>
      <CardContent>
        {/* TODO: Implement actual chart */}
        <div className="h-[300px] flex items-center justify-center text-muted-foreground">
          Chart visualization placeholder
          <br />
          Install recharts or chart.js to display cost data
        </div>
        {/* Example with Recharts:
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Area type="monotone" dataKey="cost" stroke="#8884d8" fill="#8884d8" />
          </AreaChart>
        </ResponsiveContainer>
        */}
      </CardContent>
    </Card>
  )
}

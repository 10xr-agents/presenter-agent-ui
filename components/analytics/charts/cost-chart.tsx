"use client"

import { Card, CardContent } from "@/components/ui/card"

interface CostChartProps {
  data: Array<{
    date: string
    cost: number
  }>
}

export function CostChart({ data }: CostChartProps) {
  return (
    <Card className="bg-muted/30">
      <CardContent className="pt-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Costs Over Time</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Spending over the selected period
          </p>
        </div>
        {/* TODO: Implement actual chart */}
        <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
          Chart visualization placeholder
        </div>
      </CardContent>
    </Card>
  )
}

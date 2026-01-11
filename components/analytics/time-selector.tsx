"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface TimeSelectorProps {
  selectedDays: number
  onDaysChange: (days: number) => void
}

export function TimeSelector({ selectedDays, onDaysChange }: TimeSelectorProps) {
  const periods = [
    { label: "1 Day", days: 1 },
    { label: "7 Days", days: 7 },
    { label: "30 Days", days: 30 },
    { label: "90 Days", days: 90 },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Period</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {periods.map((period) => (
            <Button
              key={period.days}
              variant={selectedDays === period.days ? "default" : "outline"}
              onClick={() => onDaysChange(period.days)}
            >
              {period.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

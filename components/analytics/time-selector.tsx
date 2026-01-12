"use client"

import { Button } from "@/components/ui/button"

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
    <div className="flex items-center gap-2">
      {periods.map((period) => (
        <Button
          key={period.days}
          variant={selectedDays === period.days ? "default" : "outline"}
          size="sm"
          onClick={() => onDaysChange(period.days)}
          className="h-8"
        >
          {period.label}
        </Button>
      ))}
    </div>
  )
}

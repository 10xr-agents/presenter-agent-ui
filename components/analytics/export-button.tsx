"use client"

import { Download } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

interface ExportButtonProps {
  data: {
    metrics: Record<string, unknown>
    analytics: Record<string, unknown>
    topAgents: Array<Record<string, unknown>>
    recentActivity: Array<Record<string, unknown>>
  }
  format?: "csv" | "json"
}

export function ExportButton({ data, format = "json" }: ExportButtonProps) {
  const handleExport = () => {
    try {
      if (format === "csv") {
        // TODO: Implement CSV export
        // For now, convert to JSON
        const jsonString = JSON.stringify(data, null, 2)
        const blob = new Blob([jsonString], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `analytics-export-${new Date().toISOString().split("T")[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success("Data exported successfully")
      } else {
        // JSON export
        const jsonString = JSON.stringify(data, null, 2)
        const blob = new Blob([jsonString], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `analytics-export-${new Date().toISOString().split("T")[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success("Data exported successfully")
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(`Export failed: ${errorMessage}`)
    }
  }

  return (
    <Button onClick={handleExport} variant="outline">
      <Download className="mr-2 h-4 w-4" />
      Export {format.toUpperCase()}
    </Button>
  )
}

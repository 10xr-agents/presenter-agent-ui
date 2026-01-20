"use client"

import { Download, HelpCircle, MessageSquare, Search } from "lucide-react"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface PageHeaderToolbarProps {
  /** Page title displayed on the left of Row 1 */
  title: string

  /** Utility buttons displayed on the right of Row 1 */
  utilityButtons?: React.ReactNode

  /** View toggle tabs (e.g., "Sending" vs "Receiving") */
  viewTabs?: {
    value: string
    label: string
  }[]
  /** Current view tab value */
  viewTabValue?: string
  /** Callback when view tab changes */
  onViewTabChange?: (value: string) => void

  /** Search input props */
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void

  /** Filter dropdowns */
  filters?: {
    label: string
    value: string
    options: { value: string; label: string }[]
    onChange?: (value: string) => void
  }[]

  /** Export button click handler */
  onExport?: () => void

  /** Additional className for the container */
  className?: string
}

/**
 * PageHeaderToolbar - A comprehensive header and toolbar section
 * 
 * Mimics Resend.com-style design with 3-row layout:
 * - Row 1: Page Title + Utility Buttons (Help/Docs/Feedback)
 * - Row 2: View Toggle (Segmented Control/Tabs)
 * - Row 3: Search + Filters + Export Button
 * 
 * Uses Zinc palette and compact styling throughout.
 */
export function PageHeaderToolbar({
  title,
  utilityButtons,
  viewTabs,
  viewTabValue,
  onViewTabChange,
  searchPlaceholder = "Search...",
  searchValue,
  onSearchChange,
  filters = [],
  onExport,
  className,
}: PageHeaderToolbarProps) {
  return (
    <div className={cn("flex flex-col space-y-4", className)}>
      {/* Row 1: Top Bar - Page Title + Utility Buttons */}
      <div className="flex justify-between items-center py-4">
        {/* Left: Page Title */}
        <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
          {title}
        </h1>

        {/* Right: Utility Buttons (Help/Docs/Feedback) */}
        <div className="flex items-center gap-2">
          {utilityButtons || (
            <>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50">
                <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                Help
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50">
                Docs
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:text-zinc-950 dark:hover:text-zinc-50">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Feedback
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Row 2: View Toggle (Sending/Receiving) */}
      {viewTabs && viewTabs.length > 0 && (
        <div className="flex items-center mt-4">
          <Tabs value={viewTabValue} onValueChange={onViewTabChange} className="w-auto">
            <TabsList className="h-9 bg-transparent p-0 border-0 border-b border-zinc-200 dark:border-zinc-800 rounded-none">
              {viewTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    "h-9 px-4 text-xs font-medium rounded-none border-b-2 border-transparent",
                    "data-[state=active]:border-zinc-950 dark:data-[state=active]:border-zinc-50",
                    "data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                    "data-[state=active]:text-zinc-950 dark:data-[state=active]:text-zinc-50",
                    "text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50"
                  )}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Row 3: Data Toolbar - Search + Filters + Export */}
      <div className="flex justify-between items-center mt-6 mb-8">
        {/* Left: Search Input */}
        <div className="relative w-[350px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 pointer-events-none" />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className={cn(
              "h-9 pl-9 text-sm",
              "bg-background border-zinc-200 dark:border-zinc-800",
              "text-zinc-950 dark:text-zinc-50",
              "placeholder:text-zinc-500 dark:placeholder:text-zinc-400",
              "focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-50"
            )}
          />
        </div>

        {/* Right: Filter Dropdowns + Export Button */}
        <div className="flex items-center gap-2">
          {filters.map((filter, index) => (
            <Select
              key={index}
              value={filter.value}
              onValueChange={filter.onChange}
            >
              <SelectTrigger
                className={cn(
                  "h-9 text-sm w-auto min-w-[140px]",
                  "bg-background border-zinc-200 dark:border-zinc-800",
                  "text-zinc-950 dark:text-zinc-50",
                  "focus:ring-zinc-950 dark:focus:ring-zinc-50"
                )}
              >
                <SelectValue placeholder={filter.label} />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

          {/* Export Button */}
          {onExport && (
            <Button
              variant="outline"
              size="icon"
              onClick={onExport}
              className={cn(
                "h-9 w-9",
                "border-zinc-200 dark:border-zinc-800",
                "text-zinc-500 dark:text-zinc-400",
                "hover:text-zinc-950 dark:hover:text-zinc-50",
                "hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
              aria-label="Export"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
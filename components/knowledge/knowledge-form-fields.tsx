"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

/**
 * Reusable Knowledge Form Fields
 * 
 * These components can be used in both the Knowledge creation form
 * and the Screen Agent creation wizard.
 */

interface KnowledgeUrlFieldProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string | null
  required?: boolean
  disabled?: boolean
}

export function KnowledgeUrlField({
  value,
  onChange,
  onBlur,
  error,
  required = false,
  disabled = false,
}: KnowledgeUrlFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="websiteUrl" className="text-xs text-foreground">
        Website URL {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id="websiteUrl"
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="https://example.com"
        required={required}
        disabled={disabled}
        className={cn("h-9", error && "border-destructive")}
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-foreground opacity-85">
          The website to extract knowledge from
        </p>
      )}
    </div>
  )
}

interface KnowledgeNameFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function KnowledgeNameField({
  value,
  onChange,
  disabled = false,
}: KnowledgeNameFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="name" className="text-xs text-foreground">
        Name
      </Label>
      <Input
        id="name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="My Website Knowledge"
        disabled={disabled}
        className="h-9"
      />
      <p className="text-xs text-foreground opacity-85">
        A friendly name for this knowledge source
      </p>
    </div>
  )
}

interface KnowledgeDescriptionFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function KnowledgeDescriptionField({
  value,
  onChange,
  disabled = false,
}: KnowledgeDescriptionFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="description" className="text-xs text-foreground">
        Description
      </Label>
      <Textarea
        id="description"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Brief description of this knowledge source"
        rows={2}
        disabled={disabled}
        className="text-sm"
      />
    </div>
  )
}

interface KnowledgePathRestrictionsProps {
  includePaths: string
  excludePaths: string
  onIncludePathsChange: (value: string) => void
  onExcludePathsChange: (value: string) => void
  disabled?: boolean
}

export function KnowledgePathRestrictions({
  includePaths,
  excludePaths,
  onIncludePathsChange,
  onExcludePathsChange,
  disabled = false,
}: KnowledgePathRestrictionsProps) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="includePaths" className="text-xs text-foreground">
          Include Paths
        </Label>
        <Input
          id="includePaths"
          value={includePaths}
          onChange={(e) => onIncludePathsChange(e.target.value)}
          placeholder="/docs/*, /help/*"
          disabled={disabled}
          className="h-9"
        />
        <p className="text-xs text-foreground opacity-85">
          Comma-separated path patterns to include. Use * for wildcards
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="excludePaths" className="text-xs text-foreground">
          Exclude Paths
        </Label>
        <Input
          id="excludePaths"
          value={excludePaths}
          onChange={(e) => onExcludePathsChange(e.target.value)}
          placeholder="/admin/*, /api/*"
          disabled={disabled}
          className="h-9"
        />
        <p className="text-xs text-foreground opacity-85">
          Comma-separated path patterns to exclude. Use * for wildcards
        </p>
      </div>
    </div>
  )
}

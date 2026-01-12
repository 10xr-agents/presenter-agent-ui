import { ReactNode } from "react"
import { type BreadcrumbItemWithActions, BreadcrumbsWithActions } from "@/components/ui/breadcrumbs-with-actions"
import { cn } from "@/lib/utils"
import { spacing, typography } from "@/lib/utils/design-system"

interface BreadcrumbItem {
  label: string
  href?: string
  actions?: Array<{
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }>
}

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  // Convert breadcrumbs to BreadcrumbsWithActions format if actions are present
  const breadcrumbItems: BreadcrumbItemWithActions[] | undefined = breadcrumbs?.map((item) => ({
    label: item.label,
    href: item.href,
    actions: item.actions,
  }))

  return (
    <div className={cn(spacing.section, className)}>
      {breadcrumbItems && breadcrumbItems.length > 0 && (
        <BreadcrumbsWithActions items={breadcrumbItems} />
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className={typography.pageTitle}>{title}</h1>
          {description && (
            <p className={typography.body + " text-muted-foreground"}>{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}

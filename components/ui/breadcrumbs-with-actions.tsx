"use client"

import { ChevronRight, MoreHorizontal } from "lucide-react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface BreadcrumbItemWithActions {
  label: string
  href?: string
  actions?: Array<{
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }>
}

interface BreadcrumbsWithActionsProps {
  items: BreadcrumbItemWithActions[]
  className?: string
  maxItems?: number
}

export function BreadcrumbsWithActions({
  items,
  className,
  maxItems = 3,
}: BreadcrumbsWithActionsProps) {
  const visibleItems = items.length > maxItems ? items.slice(-maxItems) : items
  const hiddenItems = items.length > maxItems ? items.slice(0, -maxItems) : []

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {hiddenItems.length > 0 && (
          <>
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {hiddenItems.map((item, index) => (
                    <DropdownMenuItem key={index} asChild>
                      {item.href ? (
                        <Link href={item.href}>{item.label}</Link>
                      ) : (
                        <span>{item.label}</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
          </>
        )}

        {visibleItems.map((item, index) => {
          const isLast = index === visibleItems.length - 1

          return (
            <div key={index} className="flex items-center gap-2">
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : item.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="text-muted-foreground">{item.label}</span>
                )}
              </BreadcrumbItem>

              {!isLast && (
                <BreadcrumbSeparator>
                  <ChevronRight className="h-4 w-4" />
                </BreadcrumbSeparator>
              )}

              {isLast && item.actions && item.actions.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="ml-2 rounded-md p-1 hover:bg-accent"
                      aria-label="Actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {item.actions.map((action, actionIndex) => (
                      <DropdownMenuItem
                        key={actionIndex}
                        onClick={action.onClick}
                        className="flex items-center gap-2"
                      >
                        {action.icon}
                        {action.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

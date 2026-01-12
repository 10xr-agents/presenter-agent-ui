"use client"

import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, MoreHorizontal } from "lucide-react"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type SortDirection = "asc" | "desc" | null

export interface Column<T> {
  id: string
  header: string
  accessorKey?: keyof T
  accessorFn?: (row: T) => string | number | React.ReactNode
  sortable?: boolean
  filterable?: boolean
  cell?: (row: T) => React.ReactNode
}

interface AdvancedTableProps<T> {
  data: T[]
  columns: Column<T>[]
  searchable?: boolean
  searchPlaceholder?: string
  selectable?: boolean
  onSelectionChange?: (selected: T[]) => void
  bulkActions?: React.ReactNode
  emptyMessage?: string
  className?: string
}

export function AdvancedTable<T extends { id?: string; _id?: string }>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = "Search...",
  selectable = false,
  onSelectionChange,
  bulkActions,
  emptyMessage = "No data available",
  className,
}: AdvancedTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
    columns.reduce((acc, col) => ({ ...acc, [col.id]: true }), {})
  )

  // Get row ID
  const getRowId = (row: T): string => {
    return (row.id || row._id || String(Math.random())) as string
  }

  // Filter data
  const filteredData = useMemo(() => {
    if (!searchQuery) return data

    return data.filter((row) => {
      return columns.some((col) => {
        if (col.accessorKey) {
          const value = row[col.accessorKey]
          return String(value).toLowerCase().includes(searchQuery.toLowerCase())
        }
        if (col.accessorFn) {
          const value = col.accessorFn(row)
          return String(value).toLowerCase().includes(searchQuery.toLowerCase())
        }
        return false
      })
    })
  }, [data, searchQuery, columns])

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredData

    const column = columns.find((col) => col.id === sortColumn)
    if (!column || !column.sortable) return filteredData

    return [...filteredData].sort((a, b) => {
      let aValue: string | number = ""
      let bValue: string | number = ""

      if (column.accessorKey) {
        aValue = a[column.accessorKey] as string | number
        bValue = b[column.accessorKey] as string | number
      } else if (column.accessorFn) {
        aValue = column.accessorFn(a) as string | number
        bValue = column.accessorFn(b) as string | number
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      return sortDirection === "asc" ? Number(aValue) - Number(bValue) : Number(bValue) - Number(aValue)
    })
  }, [filteredData, sortColumn, sortDirection, columns])

  // Handle sort
  const handleSort = (columnId: string) => {
    if (sortColumn === columnId) {
      if (sortDirection === "asc") {
        setSortDirection("desc")
      } else if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection(null)
      } else {
        setSortDirection("asc")
      }
    } else {
      setSortColumn(columnId)
      setSortDirection("asc")
    }
  }

  // Handle selection
  const handleSelectAll = (checked: boolean | string) => {
    const isChecked = checked === true
    if (isChecked) {
      const allIds = new Set(sortedData.map(getRowId))
      setSelectedRows(allIds)
      onSelectionChange?.(sortedData)
    } else {
      setSelectedRows(new Set())
      onSelectionChange?.([])
    }
  }

  const handleSelectRow = (rowId: string, row: T, checked: boolean | string) => {
    const isChecked = checked === true
    const newSelected = new Set(selectedRows)
    if (isChecked) {
      newSelected.add(rowId)
    } else {
      newSelected.delete(rowId)
    }
    setSelectedRows(newSelected)

    const selectedData = sortedData.filter((r) => newSelected.has(getRowId(r)))
    onSelectionChange?.(selectedData)
  }

  const visibleColumns = columns.filter((col) => columnVisibility[col.id])

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 flex-1">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
              <Filter className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}

          {selectable && selectedRows.size > 0 && bulkActions && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedRows.size} selected
              </span>
              {bulkActions}
            </div>
          )}
        </div>

        {/* Column Visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Columns
              <ChevronsUpDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={columnVisibility[column.id]}
                onCheckedChange={(checked) =>
                  setColumnVisibility({ ...columnVisibility, [column.id]: checked })
                }
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      sortedData.length > 0 && selectedRows.size === sortedData.length
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
              )}
              {visibleColumns.map((column) => (
                <TableHead key={column.id} className={column.sortable ? "cursor-pointer" : ""}>
                  <div
                    className="flex items-center gap-2"
                    onClick={() => column.sortable && handleSort(column.id)}
                  >
                    {column.header}
                    {column.sortable && (
                      <div className="flex flex-col">
                        {sortColumn === column.id && sortDirection === "asc" ? (
                          <ArrowUp className="h-3 w-3 text-primary" />
                        ) : sortColumn === column.id && sortDirection === "desc" ? (
                          <ArrowDown className="h-3 w-3 text-primary" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((row) => {
                const rowId = getRowId(row)
                return (
                  <TableRow key={rowId} className={selectedRows.has(rowId) ? "bg-muted/50" : ""}>
                    {selectable && (
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.has(rowId)}
                          onCheckedChange={(checked) => handleSelectRow(rowId, row, checked)}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.map((column) => (
                      <TableCell key={column.id}>
                        {column.cell
                          ? column.cell(row)
                          : column.accessorFn
                            ? column.accessorFn(row)
                            : column.accessorKey
                              ? String(row[column.accessorKey])
                              : ""}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination info */}
      {sortedData.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {sortedData.length} of {data.length} results
        </div>
      )}
    </div>
  )
}

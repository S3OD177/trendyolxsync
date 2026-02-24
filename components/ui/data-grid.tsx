"use client";

import { useEffect, useMemo, useRef, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type ColumnPinningState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Updater,
  type VisibilityState
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type DataGridColumnDef<TData extends object> = ColumnDef<TData, unknown> & {
  meta?: {
    headerClassName?: string;
    cellClassName?: string;
    pin?: "left" | "right";
  };
};

export type DataGridDensity = "comfortable" | "compact";

interface DataGridProps<TData extends object> {
  columns: DataGridColumnDef<TData>[];
  data: TData[];
  getRowId: (row: TData) => string;
  sorting: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
  columnVisibility: VisibilityState;
  onColumnVisibilityChange: (updater: Updater<VisibilityState>) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (updater: Updater<RowSelectionState>) => void;
  enableRowSelection?: boolean;
  isRowSelectable?: (row: TData) => boolean;
  density?: DataGridDensity;
  emptyText?: string;
  className?: string;
  maxBodyHeight?: number;
  virtualizeThreshold?: number;
  focusedRowId?: string | null;
  onFocusedRowIdChange?: (rowId: string | null) => void;
  getRowClassName?: (row: TData) => string | undefined;
}

interface IndeterminateCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  indeterminate?: boolean;
}

function IndeterminateCheckbox({ indeterminate, className, ...props }: IndeterminateCheckboxProps) {
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    ref.current.indeterminate = !!indeterminate && !props.checked;
  }, [indeterminate, props.checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-[16px] w-[16px] rounded border border-white/10 bg-black/40 text-primary accent-primary focus:ring-primary/30 cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

function resolveColumnId<TData extends object>(column: DataGridColumnDef<TData>, fallbackIndex: number) {
  if (typeof column.id === "string" && column.id.length) {
    return column.id;
  }

  if ("accessorKey" in column && typeof column.accessorKey === "string") {
    return column.accessorKey;
  }

  return `column_${fallbackIndex}`;
}

function getPinnedStyle(column: Column<any, unknown>, isHeader = false): CSSProperties | undefined {
  const pinned = column.getIsPinned();
  if (!pinned) {
    return undefined;
  }

  return {
    position: "sticky",
    left: pinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: pinned === "right" ? `${column.getAfter("right")}px` : undefined,
    zIndex: isHeader ? 40 : 20
  };
}

function getPinnedClassName(column: Column<any, unknown>, extra?: string) {
  const pinned = column.getIsPinned();
  if (!pinned) {
    return extra;
  }

  return cn(
    "bg-black/75 supports-[backdrop-filter]:bg-black/70 backdrop-blur-xl",
    pinned === "left" ? "border-r border-white/10" : "border-l border-white/10",
    extra
  );
}

export function DataGrid<TData extends object>({
  columns,
  data,
  getRowId,
  sorting,
  onSortingChange,
  columnVisibility,
  onColumnVisibilityChange,
  rowSelection,
  onRowSelectionChange,
  enableRowSelection = false,
  isRowSelectable,
  density = "comfortable",
  emptyText = "No records.",
  className,
  maxBodyHeight = 640,
  virtualizeThreshold = 120,
  focusedRowId,
  onFocusedRowIdChange,
  getRowClassName
}: DataGridProps<TData>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const selectionColumn = useMemo<DataGridColumnDef<TData>>(
    () => ({
      id: "__select__",
      size: 48,
      header: ({ table }) => (
        <div className="flex justify-center">
          <IndeterminateCheckbox
            aria-label="Select all rows"
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <IndeterminateCheckbox
            aria-label={`Select row ${row.id}`}
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            indeterminate={row.getIsSomeSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: {
        headerClassName: "w-12",
        cellClassName: "w-12",
        pin: "left"
      }
    }),
    []
  );

  const tableColumns = useMemo(
    () => (enableRowSelection ? [selectionColumn, ...columns] : columns),
    [columns, enableRowSelection, selectionColumn]
  );

  const columnPinning = useMemo<ColumnPinningState>(() => {
    const left: string[] = [];
    const right: string[] = [];

    tableColumns.forEach((column, index) => {
      const pin = column.meta?.pin;
      if (!pin) {
        return;
      }

      const id = resolveColumnId(column, index);
      if (pin === "left") {
        left.push(id);
      } else {
        right.push(id);
      }
    });

    return { left, right };
  }, [tableColumns]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    getRowId,
    state: {
      sorting,
      columnVisibility,
      columnPinning,
      rowSelection: rowSelection ?? {}
    },
    onSortingChange,
    onColumnVisibilityChange,
    onRowSelectionChange,
    enableRowSelection: enableRowSelection
      ? (row: Row<TData>) => (isRowSelectable ? isRowSelectable(row.original) : true)
      : false,
    enableMultiSort: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const rows = table.getRowModel().rows;
  const visibleLeafColumns = table.getVisibleLeafColumns();

  const shouldVirtualize = rows.length > virtualizeThreshold;
  const rowHeight = density === "compact" ? 36 : 44;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    enabled: shouldVirtualize
  });

  const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const paddingTop = !shouldVirtualize || virtualRows.length === 0 ? 0 : (virtualRows[0]?.start ?? 0);
  const paddingBottom =
    !shouldVirtualize || virtualRows.length === 0
      ? 0
      : rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end;

  const handleRowFocus = (rowId: string) => {
    onFocusedRowIdChange?.(rowId);
  };

  const handleRowArrowNav = (event: KeyboardEvent<HTMLTableRowElement>, rowId: string) => {
    if (!onFocusedRowIdChange) {
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const currentIndex = rows.findIndex((row) => row.id === rowId);
    if (currentIndex === -1) {
      return;
    }

    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = currentIndex + delta;
    const nextRow = rows[nextIndex];
    if (!nextRow) {
      return;
    }

    event.preventDefault();
    onFocusedRowIdChange(nextRow.id);
    rowRefs.current[nextRow.id]?.focus();
  };

  return (
    <div className={cn("w-full", className)}>
      <div ref={scrollRef} className="w-full overflow-y-auto overflow-x-hidden" style={{ maxHeight: maxBodyHeight }}>
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-20 bg-black/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-black/60 [&_tr]:border-b [&_tr]:border-white/10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-white/10">
                {headerGroup.headers.map((header) => {
                  const isSorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const sortLabel =
                    isSorted === "desc" ? "Sorted descending" : isSorted === "asc" ? "Sorted ascending" : "Not sorted";
                  const meta = header.column.columnDef.meta as { headerClassName?: string } | undefined;

                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "h-11 px-4 text-left align-middle text-xs font-medium uppercase tracking-wider text-muted-foreground relative",
                        getPinnedClassName(header.column),
                        meta?.headerClassName
                      )}
                      style={getPinnedStyle(header.column, true)}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1.5 hover:text-foreground"
                          aria-label={`${header.column.id} ${sortLabel}`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown className={cn("h-3.5 w-3.5", isSorted ? "text-foreground" : "text-muted-foreground")} />
                        </button>
                      ) : (
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="[&_tr:last-child]:border-0">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visibleLeafColumns.length || 1} className="py-12 text-center text-sm text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            ) : shouldVirtualize ? (
              <>
                {paddingTop > 0 ? (
                  <tr>
                    <td style={{ height: `${paddingTop}px` }} colSpan={visibleLeafColumns.length} />
                  </tr>
                ) : null}

                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      ref={(node) => {
                        rowRefs.current[row.id] = node;
                      }}
                      tabIndex={0}
                      onFocus={() => handleRowFocus(row.id)}
                      onKeyDown={(event) => handleRowArrowNav(event, row.id)}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className={cn(
                        "group border-b border-white/10 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                        focusedRowId === row.id && "bg-primary/10",
                        getRowClassName?.(row.original)
                      )}
                      style={{ height: `${rowHeight}px` }}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta as { cellClassName?: string } | undefined;
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              "px-4 align-middle relative",
                              getPinnedClassName(cell.column, "group-hover:bg-white/5"),
                              density === "compact" ? "py-1.5" : "py-2.5",
                              meta?.cellClassName
                            )}
                            style={getPinnedStyle(cell.column)}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {paddingBottom > 0 ? (
                  <tr>
                    <td style={{ height: `${paddingBottom}px` }} colSpan={visibleLeafColumns.length} />
                  </tr>
                ) : null}
              </>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  ref={(node) => {
                    rowRefs.current[row.id] = node;
                  }}
                  tabIndex={0}
                  onFocus={() => handleRowFocus(row.id)}
                  onKeyDown={(event) => handleRowArrowNav(event, row.id)}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(
                    "group border-b border-white/10 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    focusedRowId === row.id && "bg-primary/10",
                    getRowClassName?.(row.original)
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { cellClassName?: string } | undefined;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-4 align-middle relative",
                          getPinnedClassName(cell.column, "group-hover:bg-white/5"),
                          density === "compact" ? "py-1.5" : "py-2.5",
                          meta?.cellClassName
                        )}
                        style={getPinnedStyle(cell.column)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

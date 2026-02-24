"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RowSelectionState, SortingState, VisibilityState } from "@tanstack/react-table";
import { Activity, Boxes, HelpCircle, Loader2, RefreshCw, ShieldAlert, TrendingDown, X } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataGrid, type DataGridColumnDef } from "@/components/ui/data-grid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { Badge } from "@/components/ui/badge";
import { formatSar } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  loadProductsTablePrefs,
  matchesProductsSearch,
  saveProductsTablePrefs,
  type ProductsTableDensity
} from "@/lib/table/products-table-state";
import {
  runProductsSuggestBatch,
  type ProductsSuggestBatchFailure,
  type ProductsSuggestBatchItem
} from "@/lib/table/products-batch";

interface ProductRow {
  productId: string;
  sku: string;
  barcode: string | null;
  title: string;
  listingId: string | null;
  ourPrice: number | null;
  competitorMinPrice: number | null;
  deltaSar: number | null;
  deltaPct: number | null;
  buyboxStatus: "WIN" | "LOSE" | "UNKNOWN";
  suggestedPrice: number | null;
  marginSar: number | null;
  marginPct: number | null;
  breakEvenPrice: number;
  lowMarginRisk: boolean;
  lastCheckedAt: string | null;
  noDataReason?: string | null;
}

interface LossGuardInfo {
  enforcedFloor: number;
  attemptedPrice: number;
  projectedProfit: number;
}

interface DashboardResponse {
  error?: string;
  warning?: string;
  rows?: ProductRow[];
}

interface PollRunResponse {
  ok: boolean;
  processed?: number;
  skipped?: number;
  alertsCreated?: number;
  errors?: Array<{ sku: string; message: string }>;
  message?: string;
  error?: string;
}

interface PriceUpdateResult {
  ok: boolean;
  status: number;
  data: Record<string, any>;
  error?: string;
}

interface BatchUiState {
  running: boolean;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  failures: ProductsSuggestBatchFailure[];
}

const INITIAL_BATCH_STATE: BatchUiState = {
  running: false,
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  failures: []
};

async function readJsonResponse(response: Response): Promise<Record<string, any>> {
  const raw = await response.text();
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    throw new Error(`Invalid response payload (${response.status})`);
  }
}

function compareNullableNumbers(a: number | null, b: number | null) {
  return (a ?? Number.NEGATIVE_INFINITY) - (b ?? Number.NEGATIVE_INFINITY);
}

function sortRowsForMobile(rows: ProductRow[], sorting: SortingState) {
  if (!sorting.length) {
    return rows;
  }

  const [{ id, desc }] = sorting;
  const sorted = [...rows].sort((a, b) => {
    switch (id) {
      case "sku":
        return a.sku.localeCompare(b.sku);
      case "ourPrice":
        return compareNullableNumbers(a.ourPrice, b.ourPrice);
      case "competitorMinPrice":
        return compareNullableNumbers(a.competitorMinPrice, b.competitorMinPrice);
      case "deltaSar":
        return compareNullableNumbers(a.deltaSar, b.deltaSar);
      case "marginSar":
        return compareNullableNumbers(a.marginSar, b.marginSar);
      case "marginPct":
        return compareNullableNumbers(a.marginPct, b.marginPct);
      case "lastCheckedAt": {
        const aTime = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
        const bTime = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
        return aTime - bTime;
      }
      default:
        return 0;
    }
  });

  return desc ? sorted.reverse() : sorted;
}

function toLossGuardInfo(payload: Record<string, any>): LossGuardInfo | null {
  const enforcedFloor = Number(payload.enforcedFloor);
  const attemptedPrice = Number(payload.attemptedPrice);
  const projectedProfit = Number(payload.projectedProfit);

  if (!Number.isFinite(enforcedFloor) || !Number.isFinite(attemptedPrice) || !Number.isFinite(projectedProfit)) {
    return null;
  }

  return {
    enforcedFloor,
    attemptedPrice,
    projectedProfit
  };
}

const REFRESH_INTERVAL_MS = 30000;

const OPTIONAL_COLUMNS: Array<{ id: string; label: string }> = [
  { id: "barcode", label: "Barcode" },
  { id: "listingId", label: "Listing ID" },
  { id: "deltaSar", label: "Diff" },
  { id: "marginPct", label: "Profit %" },
  { id: "lastCheckedAt", label: "Last Checked" }
];

export function ProductsClient() {
  const { toast } = useToast();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const warningToastRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [lostOnly, setLostOnly] = useState(false);
  const [lowMarginRisk, setLowMarginRisk] = useState(false);

  const [sorting, setSorting] = useState<SortingState>([{ id: "lastCheckedAt", desc: true }]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [density, setDensity] = useState<ProductsTableDensity>("comfortable");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);

  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [batchState, setBatchState] = useState<BatchUiState>(INITIAL_BATCH_STATE);

  const [inlineEditRowId, setInlineEditRowId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState("");
  const [rowLossInfo, setRowLossInfo] = useState<Record<string, LossGuardInfo>>({});

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const [selectedRow, setSelectedRow] = useState<ProductRow | null>(null);
  const [lossGuardInfo, setLossGuardInfo] = useState<LossGuardInfo | null>(null);

  const hasLoadedRef = useRef(false);
  const [nextUpdate, setNextUpdate] = useState<number>(Date.now() + REFRESH_INTERVAL_MS);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const setRowUpdating = useCallback((productId: string, isUpdating: boolean) => {
    setUpdatingIds((current) => {
      const next = new Set(current);
      if (isUpdating) {
        next.add(productId);
      } else {
        next.delete(productId);
      }
      return next;
    });
  }, []);

  const setLossInfoForRow = useCallback((productId: string, info: LossGuardInfo | null) => {
    setRowLossInfo((current) => {
      if (!info && !(productId in current)) {
        return current;
      }

      const next = { ...current };
      if (info) {
        next[productId] = info;
      } else {
        delete next[productId];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const prefs = loadProductsTablePrefs();
    setSorting(prefs.sorting.length ? prefs.sorting : [{ id: "lastCheckedAt", desc: true }]);
    setColumnVisibility(prefs.columnVisibility);
    setDensity(prefs.density);
    setLostOnly(prefs.quickFilters.lostOnly);
    setLowMarginRisk(prefs.quickFilters.lowMarginRisk);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (!isTypingTarget && event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    saveProductsTablePrefs({
      density,
      sorting: sorting.slice(0, 1),
      columnVisibility,
      quickFilters: {
        lostOnly,
        lowMarginRisk
      }
    });
  }, [density, sorting, columnVisibility, lostOnly, lowMarginRisk]);

  const rowsById = useMemo(() => {
    return new Map(rows.map((row) => [row.productId, row]));
  }, [rows]);

  const selectedRows = useMemo(() => {
    return Object.entries(rowSelection)
      .filter((entry) => !!entry[1])
      .map((entry) => rowsById.get(entry[0]))
      .filter((row): row is ProductRow => !!row);
  }, [rowSelection, rowsById]);

  const loadRows = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        signal: controller.signal
      });
      const data = (await readJsonResponse(response)) as DashboardResponse;

      if (!response.ok) {
        throw new Error(data?.error || `Failed to load products (${response.status})`);
      }

      const nextRows = Array.isArray(data.rows) ? data.rows : [];

      setRows(nextRows);
      setRowSelection((current) => {
        const validIds = new Set(nextRows.map((row) => row.productId));
        const next: RowSelectionState = {};

        for (const [id, selected] of Object.entries(current)) {
          if (selected && validIds.has(id)) {
            next[id] = true;
          }
        }

        return next;
      });

      hasLoadedRef.current = true;
      setNextUpdate(Date.now() + REFRESH_INTERVAL_MS);

      const warning = typeof data.warning === "string" ? data.warning : null;
      setApiWarning(warning);
      if (warning && warningToastRef.current !== warning) {
        toast({
          title: "Products page in limited mode",
          description: warning,
          variant: "destructive"
        });
        warningToastRef.current = warning;
      }
      if (!warning) {
        warningToastRef.current = null;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      toast({
        title: "Failed to fetch products",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [toast]);

  const triggerPoll = useCallback(
    async (manual = false) => {
      setPolling(true);
      try {
        const response = await fetch("/api/poll/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const data = (await readJsonResponse(response)) as PollRunResponse;

        if (!response.ok || !data.ok) {
          throw new Error(data.error || data.message || "Poll failed");
        }

        const firstError = data.errors?.[0];
        if (firstError) {
          toast({
            title: "Poll finished with errors",
            description: `${firstError.sku}: ${firstError.message}`,
            variant: "destructive"
          });
        } else if (manual) {
          toast({
            title: "Poll completed",
            description: `Processed ${data.processed ?? 0} products, created ${data.alertsCreated ?? 0} alerts.`
          });
        }
      } catch (error) {
        toast({
          title: "Poll failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive"
        });
      } finally {
        setPolling(false);
        await loadRows();
      }
    },
    [loadRows, toast]
  );

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    const timer = setInterval(() => {
      const msRemaining = nextUpdate - Date.now();
      const secRemaining = Math.max(0, Math.ceil(msRemaining / 1000));
      setTimeLeft(secRemaining);

      if (msRemaining <= 0) {
        if (inlineEditRowId) {
          setNextUpdate(Date.now() + 1000);
          return;
        }

        void loadRows();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [nextUpdate, loadRows, inlineEditRowId]);

  const executePriceUpdate = useCallback(
    async (row: ProductRow, method: "SUGGESTED" | "CUSTOM", customValue?: number): Promise<PriceUpdateResult> => {
      const response = await fetch("/api/products/update-price", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productId: row.productId,
          method,
          customPrice: method === "CUSTOM" ? customValue : undefined
        })
      });

      const data = await readJsonResponse(response);
      if (response.ok) {
        return {
          ok: true,
          status: response.status,
          data
        };
      }

      return {
        ok: false,
        status: response.status,
        data,
        error: typeof data.error === "string" ? data.error : `Update failed (${response.status})`
      };
    },
    []
  );

  const summary = useMemo(() => {
    const total = rows.length;
    const lost = rows.filter((row) => row.buyboxStatus === "LOSE").length;
    const risk = rows.filter((row) => row.lowMarginRisk).length;
    const missingPrice = rows.filter((row) => row.ourPrice === null).length;
    return { total, lost, risk, missingPrice };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (lostOnly && row.buyboxStatus !== "LOSE") {
        return false;
      }

      if (lowMarginRisk && !row.lowMarginRisk) {
        return false;
      }

      if (!matchesProductsSearch({ sku: row.sku, title: row.title, barcode: row.barcode }, debouncedSearch)) {
        return false;
      }

      return true;
    });
  }, [rows, lostOnly, lowMarginRisk, debouncedSearch]);

  const mobileRows = useMemo(() => sortRowsForMobile(filteredRows, sorting), [filteredRows, sorting]);

  const handleSuggestedUpdate = useCallback(
    async (row: ProductRow, source: "desktop" | "mobile") => {
      setRowUpdating(row.productId, true);
      try {
        const result = await executePriceUpdate(row, "SUGGESTED");

        if (!result.ok) {
          if (result.status === 422) {
            const info = toLossGuardInfo(result.data);
            if (source === "desktop" && info) {
              setLossInfoForRow(row.productId, info);
            }

            toast({
              title: "Hard floor blocked",
              description:
                info
                  ? `Floor ${formatSar(info.enforcedFloor)} | Attempted ${formatSar(info.attemptedPrice)} | Profit ${formatSar(info.projectedProfit)}`
                  : result.error || "Suggested price is below enforced floor.",
              variant: "destructive"
            });
            return;
          }

          throw new Error(result.error || "Update failed");
        }

        setLossInfoForRow(row.productId, null);
        toast({
          title: "Price updated",
          description: `${row.sku} updated to ${formatSar(result.data.appliedPrice)}`
        });

        await loadRows();
      } catch (error) {
        toast({
          title: "Update failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive"
        });
      } finally {
        setRowUpdating(row.productId, false);
      }
    },
    [executePriceUpdate, loadRows, setLossInfoForRow, setRowUpdating, toast]
  );

  const startInlineCustomEdit = useCallback(
    (row: ProductRow) => {
      if (inlineEditRowId === row.productId) {
        setInlineEditRowId(null);
        setInlineEditValue("");
        return;
      }

      setInlineEditRowId(row.productId);
      setInlineEditValue(row.ourPrice !== null ? String(row.ourPrice) : "");
      setLossInfoForRow(row.productId, null);
    },
    [inlineEditRowId, setLossInfoForRow]
  );

  const cancelInlineCustomEdit = useCallback(() => {
    setInlineEditRowId(null);
    setInlineEditValue("");
  }, []);

  const applyInlineCustomUpdate = useCallback(
    async (row: ProductRow) => {
      const nextPrice = Number(inlineEditValue);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        toast({
          title: "Invalid price",
          description: "Enter a positive custom price.",
          variant: "destructive"
        });
        return;
      }

      setRowUpdating(row.productId, true);
      try {
        const result = await executePriceUpdate(row, "CUSTOM", nextPrice);

        if (!result.ok) {
          if (result.status === 422) {
            const info = toLossGuardInfo(result.data);
            if (info) {
              setLossInfoForRow(row.productId, info);
            }
            return;
          }

          throw new Error(result.error || "Update failed");
        }

        setLossInfoForRow(row.productId, null);
        setInlineEditRowId(null);
        setInlineEditValue("");

        toast({
          title: "Price updated",
          description: `${row.sku} updated to ${formatSar(result.data.appliedPrice)}`
        });

        await loadRows();
      } catch (error) {
        toast({
          title: "Update failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive"
        });
      } finally {
        setRowUpdating(row.productId, false);
      }
    },
    [executePriceUpdate, inlineEditValue, loadRows, setLossInfoForRow, setRowUpdating, toast]
  );

  const openMobileCustomModal = useCallback((row: ProductRow) => {
    setSelectedRow(row);
    setCustomPrice(row.ourPrice !== null ? String(row.ourPrice) : "");
    setLossGuardInfo(null);
    setCustomModalOpen(true);
  }, []);

  const applyMobileCustomUpdate = useCallback(async () => {
    if (!selectedRow) {
      return;
    }

    const nextPrice = Number(customPrice);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      toast({
        title: "Invalid price",
        description: "Enter a positive custom price.",
        variant: "destructive"
      });
      return;
    }

    setRowUpdating(selectedRow.productId, true);
    try {
      const result = await executePriceUpdate(selectedRow, "CUSTOM", nextPrice);

      if (!result.ok) {
        if (result.status === 422) {
          setLossGuardInfo(toLossGuardInfo(result.data));
          return;
        }

        throw new Error(result.error || "Update failed");
      }

      setCustomModalOpen(false);
      setLossGuardInfo(null);
      toast({
        title: "Price updated",
        description: `${selectedRow.sku} updated to ${formatSar(result.data.appliedPrice)}`
      });

      await loadRows();
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setRowUpdating(selectedRow.productId, false);
    }
  }, [customPrice, executePriceUpdate, loadRows, selectedRow, setRowUpdating, toast]);

  const handleSuggestSelected = useCallback(async () => {
    if (batchState.running || selectedRows.length === 0) {
      return;
    }

    const items: ProductsSuggestBatchItem[] = selectedRows.map((row) => ({
      productId: row.productId,
      sku: row.sku
    }));

    setBatchState({
      running: true,
      total: items.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      failures: []
    });

    const result = await runProductsSuggestBatch({
      items,
      concurrency: 3,
      onProgress: (progress) => {
        setBatchState((current) => ({
          ...current,
          running: true,
          total: progress.total,
          completed: progress.completed,
          succeeded: progress.succeeded,
          failed: progress.failed
        }));
      },
      execute: async (item) => {
        const row = rowsById.get(item.productId);
        if (!row) {
          return {
            ok: false,
            error: "Product not found in current dataset"
          };
        }

        if (row.suggestedPrice === null) {
          return {
            ok: false,
            error: "No suggested price available"
          };
        }

        setRowUpdating(item.productId, true);
        try {
          const updateResult = await executePriceUpdate(row, "SUGGESTED");
          if (updateResult.ok) {
            setLossInfoForRow(item.productId, null);
            return { ok: true };
          }

          if (updateResult.status === 422) {
            const info = toLossGuardInfo(updateResult.data);
            return {
              ok: false,
              error: updateResult.error || "Price is below enforced floor",
              status: 422,
              enforcedFloor: info?.enforcedFloor,
              attemptedPrice: info?.attemptedPrice,
              projectedProfit: info?.projectedProfit
            };
          }

          return {
            ok: false,
            error: updateResult.error || "Failed to apply suggested price",
            status: updateResult.status
          };
        } finally {
          setRowUpdating(item.productId, false);
        }
      }
    });

    setBatchState({
      running: false,
      total: result.total,
      completed: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      failures: result.failures
    });

    setRowSelection({});

    if (result.failed > 0) {
      toast({
        title: "Batch suggest finished with issues",
        description: `Updated ${result.succeeded}/${result.total}. Failed ${result.failed}.`,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Batch suggest complete",
        description: `Updated ${result.succeeded} products.`
      });
    }

    await loadRows();
  }, [
    batchState.running,
    executePriceUpdate,
    loadRows,
    rowsById,
    selectedRows,
    setLossInfoForRow,
    setRowUpdating,
    toast
  ]);

  const clearSelection = useCallback(() => {
    setRowSelection({});
  }, []);

  const hasActiveFilters = lostOnly || lowMarginRisk || debouncedSearch.trim().length > 0;

  const columns = useMemo<DataGridColumnDef<ProductRow>[]>(
    () => [
      {
        id: "sku",
        accessorKey: "sku",
        header: "SKU",
        enableHiding: false,
        size: 110,
        meta: {
          headerClassName: "w-[110px]",
          cellClassName: "font-semibold text-foreground tabular-nums",
          pin: "left"
        }
      },
      {
        id: "title",
        accessorKey: "title",
        header: "Title",
        enableHiding: false,
        size: 200,
        meta: {
          headerClassName: "w-[200px]",
          pin: "left"
        },
        cell: ({ row }) => (
          <div className="max-w-[220px] truncate text-sm text-muted-foreground" title={row.original.title}>
            {row.original.title}
          </div>
        )
      },
      {
        id: "barcode",
        accessorKey: "barcode",
        header: "Barcode",
        cell: ({ row }) => <span className="text-xs text-muted-foreground tabular-nums">{row.original.barcode || "-"}</span>
      },
      {
        id: "listingId",
        accessorKey: "listingId",
        header: "Listing ID",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.listingId || "-"}</span>
      },
      {
        id: "ourPrice",
        accessorKey: "ourPrice",
        header: "Our Price",
        meta: {
          cellClassName: "tabular-nums"
        },
        cell: ({ row }) => <span className="font-medium text-foreground">{formatSar(row.original.ourPrice)}</span>
      },
      {
        id: "competitorMinPrice",
        accessorKey: "competitorMinPrice",
        header: "BuyBox",
        meta: {
          cellClassName: "tabular-nums"
        },
        cell: ({ row }) => <span className="font-medium text-muted-foreground">{formatSar(row.original.competitorMinPrice)}</span>
      },
      {
        id: "deltaSar",
        accessorKey: "deltaSar",
        header: "Diff",
        meta: {
          cellClassName: "tabular-nums"
        },
        cell: ({ row }) => {
          if (row.original.deltaSar === null) {
            return "-";
          }

          const positive = row.original.deltaSar > 0;
          return (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-white/5 tabular-nums",
                positive ? "text-destructive" : "text-emerald-500"
              )}
            >
              {formatSar(row.original.deltaSar)} ({row.original.deltaPct?.toFixed(1)}%)
            </span>
          );
        }
      },
      {
        id: "buyboxStatus",
        accessorKey: "buyboxStatus",
        header: "Status",
        cell: ({ row }) => {
          if (!row.original.lastCheckedAt) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      PENDING
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Waiting for initial sync</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          if (row.original.buyboxStatus === "UNKNOWN") {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="gap-1.5 text-muted-foreground whitespace-nowrap">
                      <HelpCircle className="h-3 w-3" />
                      {row.original.noDataReason || "NO DATA"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {row.original.noDataReason
                        ? `Reason: ${row.original.noDataReason}`
                        : "Checked but no BuyBox data found"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }

          return <StatusBadge status={row.original.buyboxStatus} />;
        }
      },
      {
        id: "suggestedPrice",
        accessorKey: "suggestedPrice",
        header: "Suggested",
        meta: {
          cellClassName: "tabular-nums"
        },
        cell: ({ row }) => <span className="font-bold text-primary">{formatSar(row.original.suggestedPrice)}</span>
      },
      {
        id: "marginSar",
        accessorKey: "marginSar",
        header: "Profit",
        meta: {
          cellClassName: "tabular-nums"
        },
        cell: ({ row }) => {
          if (row.original.marginSar === null) {
            return "-";
          }

          const isRisk = (row.original.marginPct ?? 0) <= 5;
          return (
            <span className={isRisk ? "font-semibold text-amber-500" : "font-semibold text-emerald-500"}>
              {formatSar(row.original.marginSar)}
            </span>
          );
        }
      },
      {
        id: "marginPct",
        accessorKey: "marginPct",
        header: "Profit %",
        meta: {
          cellClassName: "tabular-nums"
        },
        cell: ({ row }) =>
          row.original.marginPct === null ? "-" : <span className="text-muted-foreground">{row.original.marginPct.toFixed(1)}%</span>
      },
      {
        id: "lastCheckedAt",
        accessorFn: (row) => (row.lastCheckedAt ? new Date(row.lastCheckedAt).getTime() : 0),
        header: "Last Checked",
        meta: {
          cellClassName: "tabular-nums"
        },
        cell: ({ row }) =>
          row.original.lastCheckedAt ? (
            <span className="text-xs text-muted-foreground">{new Date(row.original.lastCheckedAt).toLocaleString()}</span>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        enableHiding: false,
        size: 160,
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right w-[160px]",
          pin: "right"
        },
        cell: ({ row }) => {
          const product = row.original;
          const rowIsUpdating = updatingIds.has(product.productId);
          const rowInlineEditing = inlineEditRowId === product.productId;
          const rowLoss = rowLossInfo[product.productId];

          return (
            <div className="flex flex-col items-end gap-2">
              {rowInlineEditing ? (
                <div className="flex flex-wrap justify-end items-center gap-2">
                  <Input
                    value={inlineEditValue}
                    onChange={(event) => setInlineEditValue(event.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8 w-32 text-right"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void applyInlineCustomUpdate(product);
                      }

                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelInlineCustomEdit();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      void applyInlineCustomUpdate(product);
                    }}
                    disabled={rowIsUpdating}
                  >
                    {rowIsUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelInlineCustomEdit} disabled={rowIsUpdating}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Link href={`/products/${product.productId}` as Route}>
                    <Button size="sm" variant="ghost">View</Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handleSuggestedUpdate(product, "desktop");
                    }}
                    disabled={rowIsUpdating || product.suggestedPrice === null || batchState.running}
                  >
                    {rowIsUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Suggest"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => startInlineCustomEdit(product)}
                    disabled={rowIsUpdating || batchState.running}
                    className="hover:bg-primary/20 hover:text-primary"
                  >
                    Custom
                  </Button>
                </div>
              )}

              {rowLoss ? (
                <div className="max-w-[320px] rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                  Floor {formatSar(rowLoss.enforcedFloor)} | Attempted {formatSar(rowLoss.attemptedPrice)} | Profit {formatSar(rowLoss.projectedProfit)}
                </div>
              ) : null}
            </div>
          );
        }
      }
    ],
    [
      applyInlineCustomUpdate,
      batchState.running,
      cancelInlineCustomEdit,
      handleSuggestedUpdate,
      inlineEditRowId,
      inlineEditValue,
      rowLossInfo,
      startInlineCustomEdit,
      updatingIds
    ]
  );

  const batchFailuresToRender = batchState.failures.slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-black/60 p-6 shadow-[0_28px_80px_-60px_rgba(0,0,0,0.9)] md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              Pricing operations
            </div>
            <h1 className="text-3xl font-semibold text-foreground">Products</h1>
            <p className="text-sm text-muted-foreground">Fast table for pricing actions, monitoring, and bulk suggestions.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground font-medium tabular-nums">
              {inlineEditRowId ? "Auto-refresh paused while editing" : `Next update in ${timeLeft}s`}
            </span>
            {batchState.running ? (
              <span className="text-xs text-primary font-medium tabular-nums">
                Batch {batchState.completed}/{batchState.total}
              </span>
            ) : null}
            <Button
              size="sm"
              onClick={() => triggerPoll(true)}
              disabled={polling || batchState.running}
              variant="outline"
              className={cn("transition-all", polling && "border-primary/50 bg-primary/5")}
            >
              {polling ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              {polling ? "Updating..." : "Refresh Data"}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
              <Boxes className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? "-" : summary.total}</p>
            <p className="mt-1 text-xs text-muted-foreground">Active SKUs monitored</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Lost BuyBox</p>
              <ShieldAlert className="h-4 w-4 text-red-400" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-red-400">{loading ? "-" : summary.lost}</p>
            <p className="mt-1 text-xs text-muted-foreground">Requires action</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Margin Risk</p>
              <TrendingDown className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-amber-400">{loading ? "-" : summary.risk}</p>
            <p className="mt-1 text-xs text-muted-foreground">Below safety threshold</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Missing Price</p>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{loading ? "-" : summary.missingPrice}</p>
            <p className="mt-1 text-xs text-muted-foreground">No price on file</p>
          </div>
        </div>
      </div>

      {apiWarning ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-400">
          <Activity className="mr-2 inline-block h-3.5 w-3.5" />
          {apiWarning}
        </div>
      ) : null}

      <Card className="border-white/10 bg-black/50">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Product Command Center</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Search, filter, and manage pricing actions in one place.</p>
          </div>
          <div className="text-xs text-muted-foreground">
            Showing {filteredRows.length} of {rows.length} products
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1 max-w-md">
                <Input
                  ref={searchInputRef}
                  placeholder="Search SKU, title, or barcode... ( / )"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Checkbox
                  checked={lostOnly}
                  onChange={(event) => setLostOnly(event.target.checked)}
                  id="lost-only"
                  label="Lost BuyBox"
                />
                <Checkbox
                  checked={lowMarginRisk}
                  onChange={(event) => setLowMarginRisk(event.target.checked)}
                  id="low-margin"
                  label="Low Margin"
                />

                <Select value={density} onValueChange={(value) => setDensity(value as ProductsTableDensity)}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Density" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>

                <details className="relative">
                  <summary className="list-none cursor-pointer rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm">
                    Columns
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 w-48 rounded-md border border-white/10 bg-black/90 p-2 shadow-md backdrop-blur-xl">
                    {OPTIONAL_COLUMNS.map((column) => (
                      <label key={column.id} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={columnVisibility[column.id] ?? true}
                          onChange={(event) => {
                            setColumnVisibility((current) => ({
                              ...current,
                              [column.id]: event.target.checked
                            }));
                          }}
                        />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                {hasActiveFilters ? "Filters active" : "No filters applied"}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {hasActiveFilters ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setSearch("");
                      setLostOnly(false);
                      setLowMarginRisk(false);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
                {lostOnly ? (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setLostOnly(false)}>
                    Lost BuyBox
                    <X className="ml-1 h-3 w-3" />
                  </Button>
                ) : null}
                {lowMarginRisk ? (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setLowMarginRisk(false)}>
                    Low Margin
                    <X className="ml-1 h-3 w-3" />
                  </Button>
                ) : null}
                {debouncedSearch.trim() ? (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setSearch("")}>
                    Search: {debouncedSearch.trim().slice(0, 24)}
                    <X className="ml-1 h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-between rounded-md border border-white/10 bg-white/4 px-3 py-2">
              <span className="text-xs text-muted-foreground tabular-nums">{selectedRows.length} selected</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    void handleSuggestSelected();
                  }}
                  disabled={selectedRows.length === 0 || batchState.running}
                >
                  {batchState.running ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Suggesting...
                    </>
                  ) : (
                    "Suggest Selected"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                  disabled={selectedRows.length === 0 || batchState.running}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/45 overflow-hidden">
            {loading && rows.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading products...
              </div>
            ) : (
              <>
                <div className="lg:hidden">
                  {mobileRows.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">No products found matching your filters.</div>
                  ) : (
                    <div className="divide-y">
                      {mobileRows.map((row) => {
                        const rowIsUpdating = updatingIds.has(row.productId);

                        return (
                          <div key={row.productId} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="font-semibold">{row.sku}</div>
                                <div className="line-clamp-2 text-xs text-muted-foreground">{row.title}</div>
                              </div>
                              {!row.lastCheckedAt ? (
                                <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  PENDING
                                </Badge>
                              ) : row.buyboxStatus === "UNKNOWN" ? (
                                <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
                                  <HelpCircle className="h-3 w-3" />
                                  {row.noDataReason || "NO DATA"}
                                </Badge>
                              ) : (
                                <StatusBadge status={row.buyboxStatus} />
                              )}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="text-xs text-muted-foreground">Our Price</div>
                                <div className="font-medium">{formatSar(row.ourPrice)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">BuyBox</div>
                                <div className="font-medium">{formatSar(row.competitorMinPrice)}</div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Profit</div>
                                <div className={cn("font-medium", row.marginPct && row.marginPct <= 5 ? "text-amber-500" : "text-emerald-500")}>
                                  {formatSar(row.marginSar)}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-muted-foreground">Suggested</div>
                                <div className="font-medium text-primary">{formatSar(row.suggestedPrice)}</div>
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-2">
                              <Link href={`/products/${row.productId}` as Route}>
                                <Button size="sm" variant="ghost" className="w-full">View</Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  void handleSuggestedUpdate(row, "mobile");
                                }}
                                disabled={rowIsUpdating || row.suggestedPrice === null || batchState.running}
                                className="w-full"
                              >
                                {rowIsUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Suggest"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => openMobileCustomModal(row)}
                                disabled={rowIsUpdating || batchState.running}
                                className="w-full"
                              >
                                Custom
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="hidden lg:block">
                  <DataGrid
                    columns={columns}
                    data={filteredRows}
                    getRowId={(row) => row.productId}
                    sorting={sorting}
                    onSortingChange={(updater) => {
                      setSorting((current) => {
                        const next = typeof updater === "function" ? updater(current) : updater;
                        return next.slice(0, 1);
                      });
                    }}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                    rowSelection={rowSelection}
                    onRowSelectionChange={setRowSelection}
                    enableRowSelection
                    isRowSelectable={(row) => !!row.productId}
                    density={density}
                    emptyText="No products found matching your filters."
                    maxBodyHeight={680}
                    virtualizeThreshold={120}
                    focusedRowId={focusedRowId}
                    onFocusedRowIdChange={setFocusedRowId}
                    getRowClassName={(row) => {
                      if (row.buyboxStatus === "LOSE") {
                        return "bg-destructive/5";
                      }

                      if (row.lowMarginRisk) {
                        return "bg-amber-500/5";
                      }

                      return undefined;
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {!batchState.running && batchState.failures.length > 0 ? (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-destructive">
                Batch finished with {batchState.failed} failure{batchState.failed === 1 ? "" : "s"}
              </p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {batchFailuresToRender.map((failure) => (
                  <p key={`${failure.productId}-${failure.error}`}>
                    {failure.sku}: {failure.error}
                    {failure.status === 422 && failure.enforcedFloor !== undefined
                      ? ` (floor ${formatSar(failure.enforcedFloor)})`
                      : ""}
                  </p>
                ))}
                {batchState.failures.length > batchFailuresToRender.length ? (
                  <p>+ {batchState.failures.length - batchFailuresToRender.length} more failures</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={customModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCustomModalOpen(false);
            setLossGuardInfo(null);
            setSelectedRow(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom Price Update</DialogTitle>
            <DialogDescription>
              {selectedRow ? `SKU ${selectedRow.sku} • Break-even: ${formatSar(selectedRow.breakEvenPrice)}` : undefined}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="custom-price">New Price (SAR)</Label>
              <Input
                id="custom-price"
                type="number"
                step="0.01"
                min="0"
                value={customPrice}
                onChange={(event) => setCustomPrice(event.target.value)}
                className="text-lg"
              />
            </div>

            {lossGuardInfo ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold text-destructive">
                  <TrendingDown className="h-4 w-4" />
                  Hard Floor Blocked
                </div>
                <p className="mt-1 text-muted-foreground">
                  This price is below the enforced no-loss floor and cannot be applied.
                  <br />
                  Enforced floor: {formatSar(lossGuardInfo.enforcedFloor)} | Attempted: {formatSar(lossGuardInfo.attemptedPrice)} |
                  Projected: {formatSar(lossGuardInfo.projectedProfit)}
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                void applyMobileCustomUpdate();
              }}
              disabled={!selectedRow || updatingIds.has(selectedRow.productId) || !customPrice}
            >
              {selectedRow && updatingIds.has(selectedRow.productId) ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply Price"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

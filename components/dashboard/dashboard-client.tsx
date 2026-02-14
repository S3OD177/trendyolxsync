"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Loader2, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { formatSar } from "@/lib/utils/money";

interface DashboardRow {
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
}

interface LossGuardInfo {
  requiresConfirm: boolean;
  breakEvenPrice: number;
  projectedProfit: number;
}

interface DashboardResponse {
  error?: string;
  warning?: string;
  rows?: DashboardRow[];
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

export function DashboardClient() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const warningToastRef = useRef<string | null>(null);

  const [search, setSearch] = useState("");
  const [lostOnly, setLostOnly] = useState(false);
  const [lowMarginRisk, setLowMarginRisk] = useState(false);
  const [sort, setSort] = useState<"latest" | "largest_delta" | "low_margin">("latest");

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customPrice, setCustomPrice] = useState("");
  const [selectedRow, setSelectedRow] = useState<DashboardRow | null>(null);
  const [pendingMethod, setPendingMethod] = useState<"SUGGESTED" | "CUSTOM">("CUSTOM");
  const [confirmLoss, setConfirmLoss] = useState(false);
  const [lossGuardInfo, setLossGuardInfo] = useState<LossGuardInfo | null>(null);
  const autoPollAttemptRef = useRef(false);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        lostBuyboxOnly: String(lostOnly),
        lowMarginRisk: String(lowMarginRisk),
        sort
      });

      const response = await fetch(`/api/dashboard?${params.toString()}`, { cache: "no-store" });
      const data = (await readJsonResponse(response)) as DashboardResponse;

      if (!response.ok) {
        throw new Error(data?.error || `Failed to load dashboard (${response.status})`);
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);

      const warning = typeof data.warning === "string" ? data.warning : null;
      setApiWarning(warning);
      if (warning && warningToastRef.current !== warning) {
        toast({
          title: "Dashboard in limited mode",
          description: warning,
          variant: "destructive"
        });
        warningToastRef.current = warning;
      }
      if (!warning) {
        warningToastRef.current = null;
      }
    } catch (error) {
      toast({
        title: "Failed to fetch dashboard",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [search, lostOnly, lowMarginRisk, sort, toast]);

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
    const interval = window.setInterval(loadRows, 45000);
    return () => window.clearInterval(interval);
  }, [loadRows]);

  useEffect(() => {
    if (loading || polling || autoPollAttemptRef.current || rows.length === 0) {
      return;
    }

    const hasSnapshots = rows.some((row) => row.lastCheckedAt !== null);
    if (!hasSnapshots) {
      autoPollAttemptRef.current = true;
      void triggerPoll(false);
    }
  }, [rows, loading, polling, triggerPoll]);

  const summary = useMemo(() => {
    const total = rows.length;
    const lost = rows.filter((row) => row.buyboxStatus === "LOSE").length;
    const risk = rows.filter((row) => row.lowMarginRisk).length;
    return { total, lost, risk };
  }, [rows]);

  const openCustomUpdate = (row: DashboardRow) => {
    setSelectedRow(row);
    setCustomPrice(row.ourPrice ? String(row.ourPrice) : "");
    setPendingMethod("CUSTOM");
    setConfirmLoss(false);
    setLossGuardInfo(null);
    setCustomModalOpen(true);
  };

  const submitUpdate = async (
    row: DashboardRow,
    method: "SUGGESTED" | "CUSTOM",
    tryConfirm = false
  ) => {
    setUpdatingId(row.productId);

    try {
      const response = await fetch("/api/products/update-price", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          productId: row.productId,
          method,
          customPrice: method === "CUSTOM" ? Number(customPrice) : undefined,
          confirmLoss: tryConfirm
        })
      });

      const data = await readJsonResponse(response);

      if (response.status === 409 && data.requiresConfirm) {
        setSelectedRow(row);
        setPendingMethod(method);
        if (method === "SUGGESTED" && row.suggestedPrice !== null) {
          setCustomPrice(String(row.suggestedPrice));
        }
        setLossGuardInfo({
          requiresConfirm: true,
          breakEvenPrice: data.breakEvenPrice,
          projectedProfit: data.projectedProfit
        });
        setCustomModalOpen(true);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || "Update failed");
      }

      toast({
        title: "Price updated",
        description: `${row.sku} updated to ${formatSar(data.appliedPrice)}`
      });

      setCustomModalOpen(false);
      setLossGuardInfo(null);
      await loadRows();
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const renderRowActions = (row: DashboardRow, compact = false) => (
    <div className={compact ? "grid grid-cols-3 gap-2" : "flex flex-wrap justify-end gap-2"}>
      <Link href={`/products/${row.productId}` as Route}>
        <Button size="sm" variant="outline" className={compact ? "w-full" : undefined}>
          View
        </Button>
      </Link>
      <Button
        size="sm"
        onClick={() => submitUpdate(row, "SUGGESTED")}
        disabled={updatingId === row.productId || row.suggestedPrice === null}
        className={compact ? "w-full" : undefined}
      >
        Apply Suggested
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => openCustomUpdate(row)}
        disabled={updatingId === row.productId}
        className={compact ? "w-full" : undefined}
      >
        Custom
      </Button>
    </div>
  );

  const columns: DataTableColumn<DashboardRow>[] = [
    {
      key: "sku",
      header: "SKU",
      cell: (row) => <span className="font-semibold text-slate-900">{row.sku}</span>
    },
    {
      key: "barcode",
      header: "Barcode",
      className: "hidden xl:table-cell",
      cell: (row) => row.barcode || "-"
    },
    {
      key: "title",
      header: "Title",
      cell: (row) => (
        <div className="max-w-[320px] text-sm font-medium text-slate-800" title={row.title}>
          {row.title}
        </div>
      )
    },
    {
      key: "listingId",
      header: "Listing ID",
      className: "hidden 2xl:table-cell",
      cell: (row) => <span className="text-xs text-slate-500">{row.listingId || "-"}</span>
    },
    {
      key: "ourPrice",
      header: "Our Price",
      cell: (row) => <span className="font-medium text-slate-900">{formatSar(row.ourPrice)}</span>
    },
    {
      key: "competitorMin",
      header: "BuyBox Price",
      cell: (row) => <span className="font-medium">{formatSar(row.competitorMinPrice)}</span>
    },
    {
      key: "delta",
      header: "Difference",
      className: "hidden xl:table-cell",
      cell: (row) => {
        if (row.deltaSar === null) {
          return "-";
        }

        const positive = row.deltaSar > 0;
        return (
          <span className={positive ? "font-medium text-red-600" : "font-medium text-emerald-700"}>
            {formatSar(row.deltaSar)} ({row.deltaPct?.toFixed(2)}%)
          </span>
        );
      }
    },
    {
      key: "buybox",
      header: "BuyBox",
      cell: (row) => <StatusBadge status={row.buyboxStatus} />
    },
    {
      key: "suggested",
      header: "Suggested",
      cell: (row) => formatSar(row.suggestedPrice)
    },
    {
      key: "margin",
      header: "Profit",
      className: "hidden lg:table-cell",
      cell: (row) => {
        if (row.marginSar === null) {
          return "-";
        }

        const isRisk = (row.marginPct ?? 0) <= 5;
        return (
          <span className={isRisk ? "font-medium text-amber-700" : "font-medium text-emerald-700"}>
            {formatSar(row.marginSar)} ({row.marginPct?.toFixed(2)}%)
          </span>
        );
      }
    },
    {
      key: "last",
      header: "Last Check",
      className: "hidden xl:table-cell",
      cell: (row) => (
        <span className="text-xs text-slate-500">
          {row.lastCheckedAt ? new Date(row.lastCheckedAt).toLocaleString() : "-"}
        </span>
      )
    },
    {
      key: "actions",
      header: "Actions",
      className: "min-w-[240px] text-right",
      cell: (row) => renderRowActions(row)
    }
  ];

  const modalTitle =
    pendingMethod === "SUGGESTED" ? "Confirm Suggested Price Update" : "Custom Price Update";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="metric-card border-cyan-200/70">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-slate-600">Monitored Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-bold text-slate-900">{summary.total}</p>
              <Boxes className="h-5 w-5 text-cyan-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="metric-card border-red-200/70">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-slate-600">Lost BuyBox</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-bold text-red-600">{summary.lost}</p>
              <ShieldAlert className="h-5 w-5 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="metric-card border-amber-200/70">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-semibold text-slate-600">Low Margin Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-bold text-amber-600">{summary.risk}</p>
              <TriangleAlert className="h-5 w-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="surface-panel">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg text-slate-900">SKU Monitoring</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Live market visibility, safe suggested pricing, and manual updates.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Catalog sync runs automatically in every 5-minute cron poll.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Refresh runs an immediate protected poll for live prices.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => triggerPoll(true)}
                disabled={polling}
                className="border-slate-300 bg-white"
              >
                {polling ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>
          </div>

          <div className="surface-muted grid gap-3 p-3 md:grid-cols-4">
            <Input
              placeholder="Search SKU/title"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-white"
            />
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as "latest" | "largest_delta" | "low_margin")}
              options={[
                { label: "Latest", value: "latest" },
                { label: "Largest Delta", value: "largest_delta" },
                { label: "Low Margin", value: "low_margin" }
              ]}
            />
            <Checkbox
              checked={lostOnly}
              onChange={(event) => setLostOnly(event.target.checked)}
              label="Lost BuyBox only"
            />
            <Checkbox
              checked={lowMarginRisk}
              onChange={(event) => setLowMarginRisk(event.target.checked)}
              label="Low margin risk"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {apiWarning ? (
            <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {apiWarning}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading dashboard...
            </div>
          ) : (
            <>
              <div className="space-y-3 lg:hidden">
                {rows.length === 0 ? (
                  <div className="surface-muted p-6 text-center text-sm text-slate-500">
                    No products found.
                  </div>
                ) : (
                  rows.map((row) => (
                    <div key={row.productId} className="surface-muted p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{row.sku}</p>
                          <p className="line-clamp-2 text-xs text-slate-500">{row.title}</p>
                        </div>
                        <StatusBadge status={row.buyboxStatus} />
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Our Price</p>
                          <p className="text-sm font-semibold text-slate-900">{formatSar(row.ourPrice)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Competitor</p>
                          <p className="text-sm font-semibold">{formatSar(row.competitorMinPrice)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Suggested</p>
                          <p className="text-sm font-semibold">{formatSar(row.suggestedPrice)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-slate-400">Margin</p>
                          <p className="text-sm font-semibold">
                            {row.marginSar === null
                              ? "-"
                              : `${formatSar(row.marginSar)} (${row.marginPct?.toFixed(2)}%)`}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3">{renderRowActions(row, true)}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="hidden lg:block">
                <DataTable
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.productId}
                  emptyText="No products found."
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        open={customModalOpen}
        title={modalTitle}
        description={
          selectedRow
            ? `SKU ${selectedRow.sku} | Break-even: ${formatSar(selectedRow.breakEvenPrice)}`
            : undefined
        }
        onClose={() => {
          setCustomModalOpen(false);
          setLossGuardInfo(null);
          setConfirmLoss(false);
          setPendingMethod("CUSTOM");
        }}
        actions={
          <Button
            onClick={() => {
              if (!selectedRow) {
                return;
              }
              submitUpdate(selectedRow, pendingMethod, confirmLoss);
            }}
            disabled={
              !selectedRow ||
              updatingId === selectedRow?.productId ||
              (pendingMethod === "CUSTOM" && !customPrice) ||
              (lossGuardInfo?.requiresConfirm && !confirmLoss)
            }
          >
            {updatingId === selectedRow?.productId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Apply Price"
            )}
          </Button>
        }
      >
        <div className="space-y-3">
          {pendingMethod === "CUSTOM" ? (
            <div>
              <Label htmlFor="custom-price">Price (SAR)</Label>
              <Input
                id="custom-price"
                type="number"
                step="0.01"
                min="0"
                value={customPrice}
                onChange={(event) => setCustomPrice(event.target.value)}
              />
            </div>
          ) : (
            <p className="text-sm">Suggested price will be applied for this SKU.</p>
          )}

          {lossGuardInfo?.requiresConfirm ? (
            <div className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm">
              <p>
                This price may cause loss. Break-even: {formatSar(lossGuardInfo.breakEvenPrice)} | Projected
                profit: {formatSar(lossGuardInfo.projectedProfit)}
              </p>
              <div className="mt-2">
                <Checkbox
                  checked={confirmLoss}
                  onChange={(event) => setConfirmLoss(event.target.checked)}
                  label="I understand this may cause loss"
                />
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

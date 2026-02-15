"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Loader2, RefreshCw, ShieldAlert, TrendingDown, TriangleAlert, Activity, ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { formatSar } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

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
  const abortRef = useRef<AbortController | null>(null);

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
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        lostBuyboxOnly: String(lostOnly),
        lowMarginRisk: String(lowMarginRisk),
        sort
      });

      const response = await fetch(`/api/dashboard?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal
      });
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
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast({
        title: "Failed to fetch dashboard",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
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
        <Button size="sm" variant="ghost" className={compact ? "w-full" : undefined}>
          View
        </Button>
      </Link>
      <Button
        size="sm"
        variant="outline"
        onClick={() => submitUpdate(row, "SUGGESTED")}
        disabled={updatingId === row.productId || row.suggestedPrice === null}
        className={compact ? "w-full" : undefined}
      >
        Suggest
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => openCustomUpdate(row)}
        disabled={updatingId === row.productId}
        className={compact ? "w-full" : "hover:bg-primary/20 hover:text-primary"}
      >
        Custom
      </Button>
    </div>
  );

  const columns: DataTableColumn<DashboardRow>[] = [
    {
      key: "sku",
      header: "Product",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-foreground">{row.sku}</span>
          <span className="text-xs text-muted-foreground">{row.barcode || "-"}</span>
        </div>
      )
    },
    {
      key: "title",
      header: "Title",
      cell: (row) => (
        <div className="max-w-[320px] text-sm font-medium text-muted-foreground" title={row.title}>
          {row.title}
        </div>
      )
    },
    {
      key: "ourPrice",
      header: "Price",
      cell: (row) => <span className="font-medium text-foreground">{formatSar(row.ourPrice)}</span>
    },
    {
      key: "competitorMin",
      header: "BuyBox",
      cell: (row) => <span className="font-medium text-muted-foreground">{formatSar(row.competitorMinPrice)}</span>
    },
    {
      key: "delta",
      header: "Diff",
      className: "hidden xl:table-cell",
      cell: (row) => {
        if (row.deltaSar === null) {
          return "-";
        }

        const positive = row.deltaSar > 0;
        return (
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary", positive ? "text-destructive" : "text-emerald-500")}>
            {formatSar(row.deltaSar)} ({row.deltaPct?.toFixed(1)}%)
          </span>
        );
      }
    },
    {
      key: "buybox",
      header: "Status",
      cell: (row) => <StatusBadge status={row.buyboxStatus} />
    },
    {
      key: "suggested",
      header: "Suggested",
      cell: (row) => <span className="font-bold text-primary">{formatSar(row.suggestedPrice)}</span>
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
          <span className={isRisk ? "font-medium text-amber-500" : "font-medium text-emerald-500"}>
            {formatSar(row.marginSar)}
            <span className="ml-1 text-xs text-muted-foreground">({row.marginPct?.toFixed(1)}%)</span>
          </span>
        );
      }
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (row) => renderRowActions(row)
    }
  ];

  const modalTitle =
    pendingMethod === "SUGGESTED" ? "Confirm Suggested Price Update" : "Custom Price Update";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Monitor BuyBox status and competitor pricing in real-time.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="group hover:border-border transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Monitored Products
            </CardTitle>
            <div className="rounded-lg bg-primary/10 p-2">
              <Boxes className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{summary.total}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Active SKUs tracked
            </p>
          </CardContent>
        </Card>
        <Card className="group hover:border-red-500/30 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lost BuyBox</CardTitle>
            <div className="rounded-lg bg-red-500/10 p-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-400">{summary.lost}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Without BuyBox
            </p>
          </CardContent>
        </Card>
        <Card className="group hover:border-amber-500/30 transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margin Risk</CardTitle>
            <div className="rounded-lg bg-amber-500/10 p-2">
              <TriangleAlert className="h-4 w-4 text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-400">{summary.risk}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Margin below 5%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Market Overview</CardTitle>
              <CardDescription>
                Real-time BuyBox status and competitor pricing.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => triggerPoll(true)}
              disabled={polling}
            >
              {polling ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Refresh Data
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Input
                placeholder="Filter by SKU or title..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sort}
                onChange={(event) => setSort(event.target.value as "latest" | "largest_delta" | "low_margin")}
                options={[
                  { label: "Latest Updates", value: "latest" },
                  { label: "Largest Price Gap", value: "largest_delta" },
                  { label: "Critical Margins", value: "low_margin" }
                ]}
                className="w-[180px]"
              />
              <Checkbox
                checked={lostOnly}
                onChange={(event) => setLostOnly(event.target.checked)}
                id="lost-only"
                label="Lost BuyBox"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-card/50 overflow-hidden">
            {apiWarning ? (
              <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-400">
                <Activity className="mr-2 inline-block h-3.5 w-3.5" />
                {apiWarning}
              </div>
            ) : null}

            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating market data...
              </div>
            ) : (
              <>
                <div className="lg:hidden">
                  {rows.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      No products found matching your filters.
                    </div>
                  ) : (
                    <div className="divide-y">
                      {rows.map((row) => (
                        <div key={row.productId} className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="font-semibold">{row.sku}</div>
                              <div className="line-clamp-2 text-xs text-muted-foreground">{row.title}</div>
                            </div>
                            <StatusBadge status={row.buyboxStatus} />
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
                              <div className="text-xs text-muted-foreground">Margin</div>
                              <div className={cn("font-medium", row.marginPct && row.marginPct <= 5 ? "text-amber-500" : "text-emerald-500")}>
                                {formatSar(row.marginSar)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">Suggested</div>
                              <div className="font-medium text-primary">{formatSar(row.suggestedPrice)}</div>
                            </div>
                          </div>
                          <div className="mt-4">
                            {renderRowActions(row, true)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="hidden lg:block">
                  <DataTable
                    columns={columns}
                    data={rows}
                    getRowId={(row) => row.productId}
                    emptyText="No products found matching your filters."
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Modal
        open={customModalOpen}
        title={modalTitle}
        description={
          selectedRow
            ? `SKU ${selectedRow.sku} • Break-even: ${formatSar(selectedRow.breakEvenPrice)}`
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
        <div className="space-y-4 pt-4">
          {pendingMethod === "CUSTOM" ? (
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
          ) : (
            <div className="rounded-lg bg-primary/10 p-4 text-sm text-primary">
              Suggested price will be applied for this SKU.
            </div>
          )}

          {lossGuardInfo?.requiresConfirm ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-destructive">
                <TrendingDown className="h-4 w-4" />
                Potential Loss Warning
              </div>
              <p className="mt-1 text-muted-foreground">
                This price is below break-even.
                <br />
                Break-even: {formatSar(lossGuardInfo.breakEvenPrice)} | Projected: {formatSar(lossGuardInfo.projectedProfit)}
              </p>
              <div className="mt-4">
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

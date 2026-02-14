"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Upload } from "lucide-react";
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

export function DashboardClient() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
      const raw = await response.text();
      let data: { error?: string; rows?: DashboardRow[] } = {};

      if (raw.trim().length > 0) {
        try {
          data = JSON.parse(raw) as { error?: string; rows?: DashboardRow[] };
        } catch {
          throw new Error(`Dashboard API returned non-JSON response (${response.status})`);
        }
      }

      if (!response.ok) {
        throw new Error(data?.error || `Failed to load dashboard (${response.status})`);
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);
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

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    const interval = window.setInterval(loadRows, 45000);
    return () => window.clearInterval(interval);
  }, [loadRows]);

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

      const data = await response.json();

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

  const syncCatalog = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/products/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxPages: 5, pageSize: 50 })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Sync failed");
      }

      toast({
        title: "Catalog synced",
        description: `${data.totalSynced} products synced`
      });

      await loadRows();
    } catch (error) {
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const columns: DataTableColumn<DashboardRow>[] = [
    {
      key: "sku",
      header: "SKU",
      cell: (row) => <span className="font-medium">{row.sku}</span>
    },
    {
      key: "barcode",
      header: "Barcode",
      cell: (row) => row.barcode || "-"
    },
    {
      key: "title",
      header: "Title",
      cell: (row) => row.title
    },
    {
      key: "listingId",
      header: "Listing ID",
      cell: (row) => row.listingId || "-"
    },
    {
      key: "ourPrice",
      header: "Our Price",
      cell: (row) => formatSar(row.ourPrice)
    },
    {
      key: "competitorMin",
      header: "Competitor Min",
      cell: (row) => formatSar(row.competitorMinPrice)
    },
    {
      key: "delta",
      header: "Delta",
      cell: (row) =>
        row.deltaSar === null ? "-" : `${formatSar(row.deltaSar)} (${row.deltaPct?.toFixed(2)}%)`
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
      header: "Margin",
      cell: (row) =>
        row.marginSar === null ? "-" : `${formatSar(row.marginSar)} (${row.marginPct?.toFixed(2)}%)`
    },
    {
      key: "last",
      header: "Last Check",
      cell: (row) => (row.lastCheckedAt ? new Date(row.lastCheckedAt).toLocaleString() : "-")
    },
    {
      key: "actions",
      header: "Actions",
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Link href={`/products/${row.productId}`}>
            <Button size="sm" variant="outline">
              View
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => submitUpdate(row, "SUGGESTED")}
            disabled={updatingId === row.productId || row.suggestedPrice === null}
          >
            Apply Suggested
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openCustomUpdate(row)}
            disabled={updatingId === row.productId}
          >
            Custom
          </Button>
        </div>
      )
    }
  ];

  const modalTitle =
    pendingMethod === "SUGGESTED" ? "Confirm Suggested Price Update" : "Custom Price Update";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monitored Products</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lost BuyBox</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-red-600">{summary.lost}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Low Margin Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-amber-600">{summary.risk}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>SKU Monitoring</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadRows}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={syncCatalog}>
                <Upload className="mr-2 h-4 w-4" />
                Sync from Trendyol
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Search SKU/title"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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

        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading dashboard...
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={rows}
              getRowId={(row) => row.productId}
              emptyText="No products found."
            />
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

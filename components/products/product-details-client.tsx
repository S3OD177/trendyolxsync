"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toaster";
import { formatSar } from "@/lib/utils/money";

interface ProductDetailsPayload {
  product: {
    id: string;
    sku: string;
    title: string;
    barcode: string | null;
    trendyolProductId: string | null;
    snapshots: Array<{
      id: string;
      checkedAt: string;
      ourPrice: number | string | null;
      competitorMinPrice: number | string | null;
      buyboxStatus: "WIN" | "LOSE" | "UNKNOWN";
    }>;
    alerts: Array<{
      id: string;
      createdAt: string;
      message: string;
      severity: string;
    }>;
    settings: {
      costPrice: number | string;
      commissionRate: number | string | null;
      serviceFeeType: "FIXED" | "PERCENT" | null;
      serviceFeeValue: number | string | null;
      shippingCost: number | string | null;
      handlingCost: number | string | null;
      vatRate: number | string | null;
      vatMode: "INCLUSIVE" | "EXCLUSIVE" | null;
      minProfitType: "SAR" | "PERCENT" | null;
      minProfitValue: number | string | null;
      undercutStep: number | string | null;
      alertThresholdSar: number | string | null;
      alertThresholdPct: number | string | null;
      cooldownMinutes: number | null;
      competitorDropPct: number | string | null;
    } | null;
  };
  effectiveSettings: {
    costPrice: number;
    commissionRate: number;
    serviceFeeType: "FIXED" | "PERCENT";
    serviceFeeValue: number;
    shippingCost: number;
    handlingCost: number;
    vatRate: number;
    vatMode: "INCLUSIVE" | "EXCLUSIVE";
    minProfitType: "SAR" | "PERCENT";
    minProfitValue: number;
    undercutStep: number;
    alertThresholdSar: number;
    alertThresholdPct: number;
    cooldownMinutes: number;
    competitorDropPct: number;
  };
  breakEven: number;
}

const toNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid response payload (${response.status})`);
  }
}

function computeProfitAtPrice(price: number, settings: ProductDetailsPayload["effectiveSettings"]) {
  const commission = price * settings.commissionRate;
  const serviceFee =
    settings.serviceFeeType === "PERCENT" ? price * settings.serviceFeeValue : settings.serviceFeeValue;

  const vatRate = settings.vatRate / 100;
  const vatAmount = settings.vatMode === "INCLUSIVE" ? price - price / (1 + vatRate) : price * vatRate;
  const netRevenue = settings.vatMode === "INCLUSIVE" ? price - vatAmount : price;

  const totalFees = commission + serviceFee + settings.shippingCost + settings.handlingCost;
  const profit = netRevenue - totalFees - settings.costPrice;

  return {
    commission,
    serviceFee,
    vatAmount,
    netRevenue,
    totalFees,
    profit,
    profitPct: price > 0 ? (profit / price) * 100 : 0
  };
}

export function ProductDetailsClient({ productId }: { productId: string }) {
  const { toast } = useToast();
  const [payload, setPayload] = useState<ProductDetailsPayload | null>(null);
  const [simulationPrice, setSimulationPrice] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/products/${productId}/details`, { cache: "no-store" });
      const data = await readJsonResponse<ProductDetailsPayload | { error?: string }>(response);
      if (!response.ok) {
        throw new Error(("error" in data ? data.error : undefined) || "Failed to load details");
      }

      const payload = data as ProductDetailsPayload;
      setPayload(payload);
      setSimulationPrice(String(payload.breakEven.toFixed(2)));
    } catch (error) {
      toast({
        title: "Failed to load product",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  }, [productId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const chartData = useMemo(() => {
    if (!payload) {
      return [];
    }

    return [...payload.product.snapshots]
      .reverse()
      .map((point) => ({
        checkedAt: new Date(point.checkedAt).toLocaleString(),
        ourPrice: toNumber(point.ourPrice, 0),
        competitorMinPrice: point.competitorMinPrice === null ? null : toNumber(point.competitorMinPrice, 0)
      }));
  }, [payload]);

  const simulationResult = useMemo(() => {
    if (!payload) {
      return null;
    }

    const price = toNumber(simulationPrice, 0);
    return computeProfitAtPrice(price, payload.effectiveSettings);
  }, [simulationPrice, payload]);

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!payload) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    setSavingSettings(true);

    try {
      const body = {
        costPrice: toNumber(formData.get("costPrice"), 0),
        commissionRate: toNumber(formData.get("commissionRate"), 0),
        shippingCost: toNumber(formData.get("shippingCost"), 0),
        vatRate: toNumber(formData.get("vatRate"), 15),
        minProfitValue: toNumber(formData.get("minProfitValue"), 0),
      };

      const response = await fetch(`/api/products/${productId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      toast({
        title: "Settings saved",
        description: "Per-SKU pricing settings were updated."
      });

      await load();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setSavingSettings(false);
    }
  };

  if (!payload) {
    return <p className="text-sm text-muted-foreground">Loading product...</p>;
  }

  const s = payload.effectiveSettings;

  return (
    <div className="space-y-6">
      {/* Page Header with Back Button */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{payload.product.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">SKU: {payload.product.sku}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Break-even Price</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatSar(payload.breakEven)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Barcode</p>
            <p className="text-2xl font-bold text-foreground mt-1">{payload.product.barcode || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Listing ID</p>
            <p className="text-2xl font-bold text-foreground mt-1">{payload.product.trendyolProductId || "-"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="checkedAt" hide />
                <YAxis tick={{ fill: "hsl(215 20% 55%)", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222 47% 10%)",
                    border: "1px solid hsl(217 33% 20%)",
                    borderRadius: "12px",
                    color: "hsl(210 40% 98%)",
                    fontSize: "13px",
                  }}
                />
                <Line type="monotone" dataKey="ourPrice" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={false} name="Our Price" />
                <Line
                  type="monotone"
                  dataKey="competitorMinPrice"
                  stroke="hsl(0 84% 60%)"
                  strokeWidth={2}
                  dot={false}
                  name="Competitor Min"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Simulation (SAR)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Hypothetical Selling Price</Label>
              <Input
                type="number"
                value={simulationPrice}
                step="0.01"
                onChange={(event) => setSimulationPrice(event.target.value)}
              />
            </div>

            {simulationResult ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Gross Revenue</span>
                  <span className="font-medium text-foreground">{formatSar(toNumber(simulationPrice, 0))}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Net Revenue</span>
                  <span className="font-medium text-foreground">{formatSar(simulationResult.netRevenue)}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Total Fees</span>
                  <span className="font-medium text-foreground">{formatSar(simulationResult.totalFees)}</span>
                </div>
                <div className="border-t border-border/40 pt-2 flex justify-between py-1.5">
                  <span className="font-medium text-foreground">Profit</span>
                  <span className={`font-bold ${simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatSar(simulationResult.profit)} ({simulationResult.profitPct.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Break-even Price</span>
                  <span className="font-medium text-foreground">{formatSar(payload.breakEven)}</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payload.product.alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell>{new Date(alert.createdAt).toLocaleString()}</TableCell>
                    <TableCell>{alert.severity}</TableCell>
                    <TableCell>{alert.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Cost & Fee Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={saveSettings}>
            <div>
              <Label>Cost Price (SAR)</Label>
              <Input name="costPrice" type="number" defaultValue={s.costPrice} step="0.01" />
            </div>
            <div>
              <Label>Commission Rate (0-1)</Label>
              <Input name="commissionRate" type="number" defaultValue={s.commissionRate} step="0.0001" />
            </div>
            <div>
              <Label>Shipping Cost (SAR)</Label>
              <Input name="shippingCost" type="number" defaultValue={s.shippingCost} step="0.01" />
            </div>
            <div>
              <Label>VAT Rate (%)</Label>
              <Input name="vatRate" type="number" defaultValue={s.vatRate} step="0.01" />
            </div>
            <div>
              <Label>Min Profit (SAR)</Label>
              <Input name="minProfitValue" type="number" defaultValue={s.minProfitValue} step="0.01" />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={savingSettings} className="w-full">
                {savingSettings ? "Saving..." : "Save SKU Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

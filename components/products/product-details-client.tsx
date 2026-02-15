"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
        serviceFeeType: String(formData.get("serviceFeeType")) as "FIXED" | "PERCENT",
        serviceFeeValue: toNumber(formData.get("serviceFeeValue"), 0),
        shippingCost: toNumber(formData.get("shippingCost"), 0),
        handlingCost: toNumber(formData.get("handlingCost"), 0),
        vatRate: toNumber(formData.get("vatRate"), 15),
        vatMode: String(formData.get("vatMode")) as "INCLUSIVE" | "EXCLUSIVE",
        minProfitType: String(formData.get("minProfitType")) as "SAR" | "PERCENT",
        minProfitValue: toNumber(formData.get("minProfitValue"), 0),
        undercutStep: toNumber(formData.get("undercutStep"), 0.5),
        alertThresholdSar: toNumber(formData.get("alertThresholdSar"), 2),
        alertThresholdPct: toNumber(formData.get("alertThresholdPct"), 1),
        cooldownMinutes: toNumber(formData.get("cooldownMinutes"), 15),
        competitorDropPct: toNumber(formData.get("competitorDropPct"), 3)
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
      <Card className="surface-panel">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">
            {payload.product.sku} - {payload.product.title}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="surface-muted p-3">
            <p className="text-xs text-muted-foreground">Break-even Price</p>
            <p className="text-lg font-semibold">{formatSar(payload.breakEven)}</p>
          </div>
          <div className="surface-muted p-3">
            <p className="text-xs text-muted-foreground">Barcode</p>
            <p className="text-lg font-semibold">{payload.product.barcode || "-"}</p>
          </div>
          <div className="surface-muted p-3">
            <p className="text-xs text-muted-foreground">Listing ID</p>
            <p className="text-lg font-semibold">{payload.product.trendyolProductId || "-"}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="surface-panel">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="checkedAt" hide />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="ourPrice" stroke="#2563eb" strokeWidth={2} name="Our Price" />
                <Line
                  type="monotone"
                  dataKey="competitorMinPrice"
                  stroke="#dc2626"
                  strokeWidth={2}
                  name="Competitor Min"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="surface-panel">
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
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span>Gross Revenue</span>
                  <span>{formatSar(toNumber(simulationPrice, 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Net Revenue</span>
                  <span>{formatSar(simulationResult.netRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Fees</span>
                  <span>{formatSar(simulationResult.totalFees)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Profit</span>
                  <span>
                    {formatSar(simulationResult.profit)} ({simulationResult.profitPct.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Break-even Price</span>
                  <span>{formatSar(payload.breakEven)}</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="surface-panel">
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

      <Card className="surface-panel">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Cost & Fee Settings (Per SKU)</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={saveSettings}>
            <div>
              <Label>Cost Price (SAR)</Label>
              <Input name="costPrice" type="number" defaultValue={s.costPrice} step="0.01" />
            </div>
            <div>
              <Label>Commission Rate (0-1)</Label>
              <Input name="commissionRate" type="number" defaultValue={s.commissionRate} step="0.0001" />
            </div>
            <div>
              <Label>Service Fee Type</Label>
              <Select
                name="serviceFeeType"
                defaultValue={s.serviceFeeType}
                options={[
                  { label: "Percent", value: "PERCENT" },
                  { label: "Fixed", value: "FIXED" }
                ]}
              />
            </div>
            <div>
              <Label>Service Fee Value</Label>
              <Input name="serviceFeeValue" type="number" defaultValue={s.serviceFeeValue} step="0.01" />
            </div>
            <div>
              <Label>Shipping Cost (SAR)</Label>
              <Input name="shippingCost" type="number" defaultValue={s.shippingCost} step="0.01" />
            </div>
            <div>
              <Label>Handling Cost (SAR)</Label>
              <Input name="handlingCost" type="number" defaultValue={s.handlingCost} step="0.01" />
            </div>
            <div>
              <Label>VAT Rate (%)</Label>
              <Input name="vatRate" type="number" defaultValue={s.vatRate} step="0.01" />
            </div>
            <div>
              <Label>VAT Mode</Label>
              <Select
                name="vatMode"
                defaultValue={s.vatMode}
                options={[
                  { label: "Inclusive", value: "INCLUSIVE" },
                  { label: "Exclusive", value: "EXCLUSIVE" }
                ]}
              />
            </div>
            <div>
              <Label>Min Profit Type</Label>
              <Select
                name="minProfitType"
                defaultValue={s.minProfitType}
                options={[
                  { label: "SAR", value: "SAR" },
                  { label: "%", value: "PERCENT" }
                ]}
              />
            </div>
            <div>
              <Label>Min Profit Value</Label>
              <Input name="minProfitValue" type="number" defaultValue={s.minProfitValue} step="0.01" />
            </div>
            <div>
              <Label>Undercut Step (SAR)</Label>
              <Input name="undercutStep" type="number" defaultValue={s.undercutStep} step="0.01" />
            </div>
            <div>
              <Label>Alert Threshold (SAR)</Label>
              <Input name="alertThresholdSar" type="number" defaultValue={s.alertThresholdSar} step="0.01" />
            </div>
            <div>
              <Label>Alert Threshold (%)</Label>
              <Input name="alertThresholdPct" type="number" defaultValue={s.alertThresholdPct} step="0.01" />
            </div>
            <div>
              <Label>Cooldown Minutes</Label>
              <Input name="cooldownMinutes" type="number" defaultValue={s.cooldownMinutes} />
            </div>
            <div>
              <Label>Competitor Drop Trigger (%)</Label>
              <Input name="competitorDropPct" type="number" defaultValue={s.competitorDropPct} step="0.01" />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save SKU Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompetitorPriceChart } from "@/components/products/competitor-price-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { formatSar } from "@/lib/utils/money";
import { computeFees } from "@/lib/pricing/calculator";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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
    settings: {
      costPrice: number | string;
      feePercent: number | string | null;
      commissionRate: number | string | null;
      minProfitValue: number | string | null;
      autoPilot: boolean;
      minPrice: number | string | null;
      strategy: "MATCH" | "BEAT_BY_1" | "BEAT_BY_5";
    } | null;
  };
  effectiveSettings: {
    costPrice: number;
    feePercent: number;
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

const toFeePercentValue = (value: unknown, fallback = 0) => {
  const numeric = toNumber(value, fallback);
  if (numeric > 0 && numeric < 1) {
    return numeric * 100;
  }

  return numeric;
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
  const result = computeFees(price, settings);

  return {
    commission: result.commissionFee,
    serviceFee: result.serviceFee,
    vatAmount: result.vatAmount,
    netRevenue: result.netRevenue,
    totalFees: result.totalFees,
    profit: result.profitSar,
    profitPct: result.profitPct
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

      const nextPayload = data as ProductDetailsPayload;
      setPayload(nextPayload);
      setSimulationPrice(String(nextPayload.breakEven.toFixed(2)));
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
    const autoPilot = formData.get("autoPilot") === "on";

    setSavingSettings(true);

    try {
      const body = {
        costPrice: toNumber(formData.get("costPrice"), 0),
        feePercent: toNumber(formData.get("feePercent"), 0),
        minProfitValue: toNumber(formData.get("minProfitValue"), 0),
        autoPilot,
        minPrice: toNumber(formData.get("minPrice"), 0),
        strategy: formData.get("strategy")
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

  const s = payload.product.settings || {
    costPrice: 0,
    feePercent: toFeePercentValue(payload.effectiveSettings.feePercent, 0),
    commissionRate: 0,
    minProfitValue: 0,
    autoPilot: false,
    minPrice: 0,
    strategy: "MATCH"
  };

  const feeDefaultValue =
    s.feePercent !== null && s.feePercent !== undefined
      ? toFeePercentValue(s.feePercent, 0)
      : toFeePercentValue(s.commissionRate, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">{payload.product.title}</h1>
          {s.autoPilot && (
            <Badge
              variant="default"
              className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-emerald-500/20"
            >
              Auto-Pilot ON
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">SKU: {payload.product.sku}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Enforced Floor Price</p>
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

      <CompetitorPriceChart productId={productId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-foreground flex items-center justify-between">
              <span>Auto-Pilot Configuration</span>
              {s.autoPilot ? (
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <span className="flex h-2 w-2 rounded-full bg-slate-500" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveSettings}>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Enable Auto-Pilot</Label>
                  <p className="text-sm text-muted-foreground">Allow system to automatically reprice this item.</p>
                </div>
                <Switch name="autoPilot" defaultChecked={s.autoPilot} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>
                    Cost Price (excl. VAT) (SAR) <span className="text-red-400">*</span>
                  </Label>
                  <Input name="costPrice" type="number" defaultValue={s.costPrice} step="0.01" required />
                  <p className="text-[10px] text-muted-foreground mt-1">15% VAT is auto-added in floor calculation.</p>
                </div>
                <div>
                  <Label>Fees (%)</Label>
                  <Input name="feePercent" type="number" defaultValue={feeDefaultValue} step="0.01" min="0" />
                  <p className="text-[10px] text-muted-foreground mt-1">Accepts decimal (0.15) or percent (15).</p>
                </div>
                <div>
                  <Label>Min Price Floor (SAR)</Label>
                  <Input name="minPrice" type="number" defaultValue={s.minPrice ?? 0} step="0.01" />
                  <p className="text-[10px] text-muted-foreground mt-1">Final floor is max(no-loss floor, min price).</p>
                </div>
                <div>
                  <Label>Strategy</Label>
                  <Select name="strategy" defaultValue={s.strategy || "MATCH"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MATCH">Match Competitor</SelectItem>
                      <SelectItem value="BEAT_BY_1">Beat by 1 SAR</SelectItem>
                      <SelectItem value="BEAT_BY_5">Beat by 5 SAR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="hidden">
                  <Input name="minProfitValue" type="hidden" defaultValue={s.minProfitValue ?? 0} />
                </div>
              </div>

              <Button type="submit" disabled={savingSettings} className="w-full">
                {savingSettings ? "Saving..." : "Save Auto-Pilot Settings"}
              </Button>
            </form>
          </CardContent>
        </Card>

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
                  <span className="text-muted-foreground">VAT on Cost (15%)</span>
                  <span className="font-medium text-foreground">{formatSar(simulationResult.vatAmount)}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Total Fees + Shipping</span>
                  <span className="font-medium text-foreground">{formatSar(simulationResult.totalFees)}</span>
                </div>
                <div className="border-t border-border/40 pt-2 flex justify-between py-1.5">
                  <span className="font-medium text-foreground">Profit</span>
                  <span className={`font-bold ${simulationResult.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {formatSar(simulationResult.profit)} ({simulationResult.profitPct.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">Enforced Floor</span>
                  <span className="font-medium text-foreground">{formatSar(payload.breakEven)}</span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";

interface GlobalSettingsForm {
  feePercent: number;
  shippingCost: number;
  minProfitType: "SAR" | "PERCENT";
  minProfitValue: number;
  undercutStep: number;
  alertThresholdSar: number;
  alertThresholdPct: number;
  cooldownMinutes: number;
  competitorDropPct: number;
}

interface SallaStatusPayload {
  configured: boolean;
  oauthReady: boolean;
  connected: boolean;
  costSource: "PRE_TAX" | "COST_PRICE";
  credential?: {
    source?: string;
    tokenConfigured?: boolean;
    tokenType?: string | null;
    scope?: string | null;
    merchantId?: string | null;
    expiresAt?: string | null;
    expired?: boolean;
  } | null;
  error?: string;
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "N/A";
  }

  return date.toLocaleString();
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

export function SettingsClient() {
  const { toast } = useToast();
  const [form, setForm] = useState<GlobalSettingsForm | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});
  const [sallaStatus, setSallaStatus] = useState<SallaStatusPayload | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingSalla, setSyncingSalla] = useState(false);
  const [refreshingSallaStatus, setRefreshingSallaStatus] = useState(false);

  const loadSallaStatus = useCallback(
    async (silent = false) => {
      if (!silent) {
        setRefreshingSallaStatus(true);
      }

      try {
        const response = await fetch("/api/integrations/salla/status", { cache: "no-store" });
        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch Salla status");
        }

        setSallaStatus({
          configured: Boolean(data.configured),
          oauthReady: Boolean(data.oauthReady),
          connected: Boolean(data.connected),
          costSource: data.costSource === "COST_PRICE" ? "COST_PRICE" : "PRE_TAX",
          credential: data.credential ?? null,
          error: typeof data.error === "string" ? data.error : undefined
        });
      } catch (error) {
        if (!silent) {
          toast({
            title: "Failed to load Salla status",
            description: error instanceof Error ? error.message : "Unknown error",
            variant: "destructive"
          });
        }
      } finally {
        if (!silent) {
          setRefreshingSallaStatus(false);
        }
      }
    },
    [toast]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Failed to load settings");
        }

        const feePercent = toNumber(data.settings.feePercent, toNumber(data.settings.commissionRate) * 100);

        setForm({
          feePercent,
          shippingCost: toNumber(data.settings.shippingCost),
          minProfitType: data.settings.minProfitType,
          minProfitValue: toNumber(data.settings.minProfitValue),
          undercutStep: toNumber(data.settings.undercutStep),
          alertThresholdSar: toNumber(data.settings.alertThresholdSar),
          alertThresholdPct: toNumber(data.settings.alertThresholdPct),
          cooldownMinutes: data.settings.cooldownMinutes,
          competitorDropPct: toNumber(data.settings.competitorDropPct)
        });

        setIntegrations(data.integrations || {});
        setWarning(typeof data.warning === "string" ? data.warning : null);
      } catch (error) {
        toast({
          title: "Failed to load settings",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    void Promise.all([load(), loadSallaStatus(true)]);
  }, [toast, loadSallaStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthState = params.get("sallaOAuth");
    const message = params.get("sallaMessage");

    if (!oauthState) {
      return;
    }

    toast({
      title: oauthState === "connected" ? "Salla connected" : "Salla OAuth failed",
      description:
        message || (oauthState === "connected" ? "OAuth connection completed successfully." : "Please try again."),
      variant: oauthState === "connected" ? "default" : "destructive"
    });

    params.delete("sallaOAuth");
    params.delete("sallaMessage");
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);

    void loadSallaStatus(true);
  }, [toast, loadSallaStatus]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      toast({
        title: "Settings updated",
        description: "Global pricing defaults were saved."
      });

      setIntegrations(data.integrations || {});
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const connectSallaOAuth = () => {
    window.location.href = "/api/integrations/salla/oauth/start";
  };

  const syncSallaProducts = async () => {
    setSyncingSalla(true);

    try {
      const response = await fetch("/api/integrations/salla/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeOnly: true,
          limit: 100,
          offset: 0,
          persist: true,
          dryRun: false
        })
      });
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "Salla sync failed");
      }

      toast({
        title: "Salla sync completed",
        description: `Matched ${data.matched ?? 0}, updated ${data.updated ?? 0}, skipped ${data.skipped ?? 0}.`
      });

      await loadSallaStatus(true);
    } catch (error) {
      toast({
        title: "Salla sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setSyncingSalla(false);
    }
  };

  if (loading || !form) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>;
  }

  const sallaConnected = Boolean(sallaStatus?.connected);
  const sallaSource = sallaStatus?.credential?.source?.toUpperCase() ?? "N/A";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage integrations and global pricing defaults.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="text-lg">Integration Status</CardTitle>
            <p className="text-sm text-muted-foreground">Validate credentials and API connections.</p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {warning ? (
            <div className="md:col-span-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-400">
              {warning}
            </div>
          ) : null}

          <div className="surface-muted space-y-2 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">Trendyol API</span>
              <Badge variant={integrations.trendyolConfigured ? "success" : "destructive"}>
                {integrations.trendyolConfigured ? "Configured" : "Missing"}
              </Badge>
            </div>
          </div>

          <div className="surface-muted space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">Salla Integration</span>
              <Badge variant={sallaConnected ? "success" : "destructive"}>
                {sallaConnected ? "Connected" : "Disconnected"}
              </Badge>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                Auth source: <span className="font-medium text-foreground">{sallaSource}</span>
              </p>
              <p>
                OAuth ready:{" "}
                <span className="font-medium text-foreground">{sallaStatus?.oauthReady ? "Yes" : "No"}</span>
              </p>
              <p>
                Cost source: <span className="font-medium text-foreground">{sallaStatus?.costSource ?? "PRE_TAX"}</span>
              </p>
              <p>
                Token expiry:{" "}
                <span className="font-medium text-foreground">
                  {formatDateTime(sallaStatus?.credential?.expiresAt)}
                </span>
              </p>
              {sallaStatus?.error ? <p className="text-red-400">{sallaStatus.error}</p> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={connectSallaOAuth} disabled={!sallaStatus?.oauthReady}>
                Connect OAuth
              </Button>
              <Button size="sm" onClick={syncSallaProducts} disabled={!sallaConnected || syncingSalla}>
                {syncingSalla ? "Syncing..." : "Sync Salla Products"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => loadSallaStatus()}
                disabled={refreshingSallaStatus}
              >
                {refreshingSallaStatus ? "Refreshing..." : "Refresh Status"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Global Pricing Defaults (SAR)</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
            <div>
              <Label>Fees (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.feePercent}
                className="bg-background"
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, feePercent: Number(event.target.value) } : current))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">Accepts 0.15 or 15 format.</p>
            </div>

            <div>
              <Label>Shipping Cost (SAR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.shippingCost}
                className="bg-background"
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, shippingCost: Number(event.target.value) } : current))
                }
              />
            </div>

            <div>
              <Label>Min Profit (SAR or %)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.minProfitValue}
                className="bg-background"
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, minProfitValue: Number(event.target.value) } : current))
                }
              />
            </div>

            <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
              VAT is fixed at <span className="font-medium text-foreground">15%</span> and auto-added on cost.
            </div>

            <div className="md:col-span-2 pt-4">
              <Button type="submit" disabled={saving} className="w-full md:w-auto">
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

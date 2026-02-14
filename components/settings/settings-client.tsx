"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";

interface GlobalSettingsForm {
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
}

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simpleMode, setSimpleMode] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const data = await readJsonResponse(response);

        if (!response.ok) {
          throw new Error(data.error || "Failed to load settings");
        }

        setForm({
          commissionRate: toNumber(data.settings.commissionRate),
          serviceFeeType: data.settings.serviceFeeType,
          serviceFeeValue: toNumber(data.settings.serviceFeeValue),
          shippingCost: toNumber(data.settings.shippingCost),
          handlingCost: toNumber(data.settings.handlingCost),
          vatRate: toNumber(data.settings.vatRate),
          vatMode: data.settings.vatMode,
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

    load();
  }, [toast]);

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

  if (loading || !form) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>;
  }

  return (
    <div className="space-y-6">
      <Card className="surface-panel">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Integration Status</CardTitle>
            <p className="text-sm text-slate-500">
              Validate credentials and defaults used across all monitored products.
            </p>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {warning ? (
            <div className="md:col-span-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {warning}
            </div>
          ) : null}
          <div className="surface-muted flex items-center justify-between p-3">
            <span className="font-medium text-slate-700">Trendyol API</span>
            <Badge variant={integrations.trendyolConfigured ? "success" : "destructive"}>
              {integrations.trendyolConfigured ? "Configured" : "Missing"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="surface-panel">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-lg text-slate-900">Global Pricing Defaults (SAR)</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Label htmlFor="mode-toggle" className="text-sm text-slate-600">Simple Mode</Label>
            <Button
              type="button"
              variant={simpleMode ? "default" : "outline"}
              size="sm"
              onClick={() => setSimpleMode(!simpleMode)}
              className={simpleMode ? "bg-cyan-700 hover:bg-cyan-800" : ""}
            >
              {simpleMode ? "On" : "Off"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
            {/* Simple Fields - Always Visible */}
            <div>
              <Label>Commission Rate (0-1)</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.commissionRate}
                className="bg-white"
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, commissionRate: Number(event.target.value) } : current))
                }
              />
            </div>

            <div>
              <Label>Shipping Cost (SAR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.shippingCost}
                className="bg-white"
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, shippingCost: Number(event.target.value) } : current))
                }
              />
            </div>

            <div>
              <Label>VAT Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.vatRate}
                className="bg-white"
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, vatRate: Number(event.target.value) } : current))
                }
              />
            </div>

            <div>
              <Label>Min Profit Value {form.minProfitType === "PERCENT" ? "(%)" : "(SAR)"}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.minProfitValue}
                className="bg-white"
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, minProfitValue: Number(event.target.value) } : current))
                }
              />
            </div>

            {/* Advanced Fields - Hidden in Simple Mode */}
            {!simpleMode && (
              <>
                <div className="col-span-full border-t border-slate-100 my-2 pt-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Advanced Accounting</p>
                </div>

                <div>
                  <Label>Service Fee Type</Label>
                  <Select
                    value={form.serviceFeeType}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, serviceFeeType: event.target.value as "FIXED" | "PERCENT" }
                          : current
                      )
                    }
                    options={[
                      { label: "Percent", value: "PERCENT" },
                      { label: "Fixed", value: "FIXED" }
                    ]}
                  />
                </div>
                <div>
                  <Label>Service Fee Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.serviceFeeValue}
                    className="bg-white"
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, serviceFeeValue: Number(event.target.value) } : current))
                    }
                  />
                </div>
                <div>
                  <Label>Handling Cost (SAR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.handlingCost}
                    className="bg-white"
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, handlingCost: Number(event.target.value) } : current))
                    }
                  />
                </div>

                <div>
                  <Label>VAT Mode</Label>
                  <Select
                    value={form.vatMode}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, vatMode: event.target.value as "INCLUSIVE" | "EXCLUSIVE" }
                          : current
                      )
                    }
                    options={[
                      { label: "Inclusive", value: "INCLUSIVE" },
                      { label: "Exclusive", value: "EXCLUSIVE" }
                    ]}
                  />
                </div>
                <div>
                  <Label>Min Profit Type</Label>
                  <Select
                    value={form.minProfitType}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, minProfitType: event.target.value as "SAR" | "PERCENT" }
                          : current
                      )
                    }
                    options={[
                      { label: "SAR", value: "SAR" },
                      { label: "%", value: "PERCENT" }
                    ]}
                  />
                </div>

                <div className="col-span-full border-t border-slate-100 my-2 pt-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Repricing Rules</p>
                </div>

                <div>
                  <Label>Undercut Step (SAR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.undercutStep}
                    className="bg-white"
                    onChange={(event) =>
                      setForm((current) => (current ? { ...current, undercutStep: Number(event.target.value) } : current))
                    }
                  />
                </div>
                <div>
                  <Label>Alert Threshold (SAR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.alertThresholdSar}
                    className="bg-white"
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, alertThresholdSar: Number(event.target.value) } : current
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Alert Threshold (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.alertThresholdPct}
                    className="bg-white"
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, alertThresholdPct: Number(event.target.value) } : current
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Cooldown Minutes</Label>
                  <Input
                    type="number"
                    value={form.cooldownMinutes}
                    className="bg-white"
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, cooldownMinutes: Number(event.target.value) } : current
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Competitor Drop Trigger (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.competitorDropPct}
                    className="bg-white"
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, competitorDropPct: Number(event.target.value) } : current
                      )
                    }
                  />
                </div>
              </>
            )}

            <div className="md:col-span-2 pt-4">
              <Button type="submit" disabled={saving} className="bg-cyan-700 text-white hover:bg-cyan-800 w-full md:w-auto">
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

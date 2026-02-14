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

export function SettingsClient() {
  const { toast } = useToast();
  const [form, setForm] = useState<GlobalSettingsForm | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const data = await response.json();

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
      const data = await response.json();

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

  const sendTestNotification = async (channel: "email" | "telegram" | "all") => {
    try {
      const response = await fetch("/api/settings/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send test notification");
      }

      const reason = data?.result?.reason;
      const sent = data?.result?.sent;
      const channelResult =
        channel === "all"
          ? "Triggered all channel tests."
          : sent === false
            ? reason || "Channel is not configured."
            : "Notification sent.";

      toast({
        title: "Test notification sent",
        description: `Channel: ${channel}. ${channelResult}`
      });
    } catch (error) {
      toast({
        title: "Notification test failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  };

  if (loading || !form) {
    return <p className="text-sm text-muted-foreground">Loading settings...</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integration Status</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <span>Trendyol API</span>
            <Badge variant={integrations.trendyolConfigured ? "success" : "destructive"}>
              {integrations.trendyolConfigured ? "Configured" : "Missing"}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <span>SMTP Email</span>
            <Badge variant={integrations.smtpConfigured ? "success" : "warning"}>
              {integrations.smtpConfigured ? "Configured" : "Optional"}
            </Badge>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <span>Telegram Bot</span>
            <Badge variant={integrations.telegramConfigured ? "success" : "warning"}>
              {integrations.telegramConfigured ? "Configured" : "Optional"}
            </Badge>
          </div>
          <div className="md:col-span-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => sendTestNotification("email")}>
                Test Email
              </Button>
              <Button type="button" variant="outline" onClick={() => sendTestNotification("telegram")}>
                Test Telegram
              </Button>
              <Button type="button" onClick={() => sendTestNotification("all")}>
                Test All Channels
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Global Pricing Defaults (SAR)</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={submit}>
            <div>
              <Label>Commission Rate (0-1)</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.commissionRate}
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, commissionRate: Number(event.target.value) } : current))
                }
              />
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
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, serviceFeeValue: Number(event.target.value) } : current))
                }
              />
            </div>
            <div>
              <Label>Shipping Cost (SAR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.shippingCost}
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, shippingCost: Number(event.target.value) } : current))
                }
              />
            </div>
            <div>
              <Label>Handling Cost (SAR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.handlingCost}
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, handlingCost: Number(event.target.value) } : current))
                }
              />
            </div>
            <div>
              <Label>VAT Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.vatRate}
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, vatRate: Number(event.target.value) } : current))
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
            <div>
              <Label>Min Profit Value</Label>
              <Input
                type="number"
                step="0.01"
                value={form.minProfitValue}
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, minProfitValue: Number(event.target.value) } : current))
                }
              />
            </div>
            <div>
              <Label>Undercut Step (SAR)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.undercutStep}
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
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, competitorDropPct: Number(event.target.value) } : current
                  )
                }
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

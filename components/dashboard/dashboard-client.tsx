"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Boxes, Loader2, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { AnalyticsCharts } from "@/components/dashboard/analytics-charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils/cn";

interface DashboardRowSummary {
  buyboxStatus: "WIN" | "LOSE" | "UNKNOWN";
  lowMarginRisk: boolean;
}

interface DashboardResponse {
  error?: string;
  warning?: string;
  rows?: DashboardRowSummary[];
}

interface PollRunResponse {
  ok: boolean;
  processed?: number;
  alertsCreated?: number;
  error?: string;
  message?: string;
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
  const [rows, setRows] = useState<DashboardRowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [apiWarning, setApiWarning] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard?sort=latest&lostBuyboxOnly=false&lowMarginRisk=false", {
        cache: "no-store"
      });
      const data = (await readJsonResponse(response)) as DashboardResponse;

      if (!response.ok) {
        throw new Error(data.error || `Failed to load dashboard (${response.status})`);
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setApiWarning(typeof data.warning === "string" ? data.warning : null);
    } catch (error) {
      toast({
        title: "Failed to load dashboard",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const triggerPoll = useCallback(async () => {
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

      toast({
        title: "Refresh completed",
        description: `Processed ${data.processed ?? 0} products, created ${data.alertsCreated ?? 0} alerts.`
      });

      await loadSummary();
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setPolling(false);
    }
  }, [loadSummary, toast]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const summary = useMemo(() => {
    const total = rows.length;
    const lost = rows.filter((row) => row.buyboxStatus === "LOSE").length;
    const risk = rows.filter((row) => row.lowMarginRisk).length;
    return { total, lost, risk };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">High-level monitoring only. Product actions moved to Products page.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/products">
            <Button variant="default" className="gap-2">
              Open Products
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={triggerPoll}
            disabled={polling || loading}
            variant="outline"
            className={cn("transition-all", polling && "border-primary/50 bg-primary/5")}
          >
            {polling ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            {polling ? "Refreshing..." : "Refresh Data"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="group hover:border-border transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monitored Products</CardTitle>
            <div className="rounded-lg bg-primary/10 p-2">
              <Boxes className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{loading ? "-" : summary.total}</div>
            <p className="mt-1 text-xs text-muted-foreground">Active SKUs tracked</p>
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
            <div className="text-3xl font-bold text-red-400">{loading ? "-" : summary.lost}</div>
            <p className="mt-1 text-xs text-muted-foreground">Without BuyBox</p>
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
            <div className="text-3xl font-bold text-amber-400">{loading ? "-" : summary.risk}</div>
            <p className="mt-1 text-xs text-muted-foreground">Margin below 5%</p>
          </CardContent>
        </Card>
      </div>

      {apiWarning ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-400">
          <Activity className="mr-2 inline-block h-3.5 w-3.5" />
          {apiWarning}
        </div>
      ) : null}

      <AnalyticsCharts />

      <Card>
        <CardHeader>
          <CardTitle>Products Workspace</CardTitle>
          <CardDescription>
            Detailed product table, filters, and price actions are now separated to keep dashboard focused.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/products">
            <Button variant="outline" className="gap-2">
              Go to Products
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

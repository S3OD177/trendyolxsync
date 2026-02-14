"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/components/ui/toaster";

interface AlertItem {
  id: string;
  createdAt: string;
  type: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  message: string;
  isRead: boolean;
  product: {
    sku: string;
    title: string;
  };
}

const severityVariant = {
  INFO: "secondary",
  WARN: "warning",
  CRITICAL: "destructive"
} as const;

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

export function AlertsCenterClient() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/alerts", { cache: "no-store" });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch alerts");
      }

      setAlerts(data.alerts || []);
      setWarning(typeof data.warning === "string" ? data.warning : null);
    } catch (error) {
      toast({
        title: "Failed to load alerts",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const markRead = async (alertId: string) => {
    try {
      const response = await fetch("/api/alerts/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId })
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || "Failed to mark alert as read");
      }

      setAlerts((current) =>
        current.map((item) => (item.id === alertId ? { ...item, isRead: true } : item))
      );
    } catch (error) {
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  };

  const visibleAlerts = unreadOnly ? alerts.filter((item) => !item.isRead) : alerts;
  const unreadCount = alerts.filter((item) => !item.isRead).length;

  return (
    <Card className="surface-panel">
      <CardHeader className="space-y-4">
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg text-slate-900">Alerts Center</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {unreadCount} unread alerts out of {alerts.length} total.
            </p>
          </div>
          <div className="surface-muted px-3 py-2">
            <Checkbox
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
              label="Unread only"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {warning ? (
          <div className="mb-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {warning}
          </div>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading alerts...</p>
        ) : visibleAlerts.length === 0 ? (
          <div className="surface-muted p-8 text-center text-sm text-slate-500">
            No alerts to display.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleAlerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="text-xs text-slate-500">
                    {new Date(alert.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-slate-900">{alert.product.sku}</div>
                    <div className="text-xs text-muted-foreground">{alert.product.title}</div>
                  </TableCell>
                  <TableCell>{alert.type}</TableCell>
                  <TableCell>
                    <Badge variant={severityVariant[alert.severity]}>{alert.severity}</Badge>
                  </TableCell>
                  <TableCell>{alert.message}</TableCell>
                  <TableCell>
                    {alert.isRead ? <Badge variant="secondary">READ</Badge> : <Badge>NEW</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!alert.isRead ? (
                      <Button size="sm" variant="outline" onClick={() => markRead(alert.id)}>
                        Mark Read
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

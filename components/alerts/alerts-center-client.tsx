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

export function AlertsCenterClient() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/alerts", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch alerts");
      }

      setAlerts(data.alerts || []);
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
      const data = await response.json();
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Alerts Center</CardTitle>
        <Checkbox
          checked={unreadOnly}
          onChange={(event) => setUnreadOnly(event.target.checked)}
          label="Unread only"
        />
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading alerts...</p>
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
                  <TableCell>{new Date(alert.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="font-medium">{alert.product.sku}</div>
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

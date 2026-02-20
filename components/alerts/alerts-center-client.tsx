"use client";

import { CheckCheck, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils/cn";

interface AlertItem {
  id: string;
  createdAt: string;
  type: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  message: string;
  isRead: boolean;
  metadataJson?: Record<string, unknown> | null;
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

type StatusFilter = "ALL" | "UNREAD" | "READ";
type SeverityFilter = "ALL" | AlertItem["severity"];
type SortMode = "NEWEST" | "OLDEST" | "SEVERITY";

const severityRank: Record<AlertItem["severity"], number> = {
  CRITICAL: 3,
  WARN: 2,
  INFO: 1
};

function formatType(type: string) {
  return type
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatRelativeDate(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms)) {
    return "-";
  }
  if (ms < 60_000) {
    return "Just now";
  }
  if (ms < 3_600_000) {
    return `${Math.floor(ms / 60_000)}m ago`;
  }
  if (ms < 86_400_000) {
    return `${Math.floor(ms / 3_600_000)}h ago`;
  }
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function normalizeFieldName(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function extractMissingFields(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const raw = (metadata as Record<string, unknown>).missingFields;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeFieldName(item));
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Invalid response payload (${response.status})`);
  }
}

export function AlertsCenterClient() {
  const { toast } = useToast();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [sortMode, setSortMode] = useState<SortMode>("NEWEST");
  const [markingIds, setMarkingIds] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    if (alerts.length > 0) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch("/api/alerts", { cache: "no-store" });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to fetch alerts"
        );
      }

      const payload = Array.isArray(data.alerts) ? (data.alerts as AlertItem[]) : [];
      setAlerts(payload);
      setWarning(typeof data.warning === "string" ? data.warning : null);
    } catch (error) {
      toast({
        title: "Failed to load alerts",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [alerts.length, toast]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const markRead = useCallback(
    async (alertIds: string[]) => {
      const deduped = Array.from(new Set(alertIds));
      if (!deduped.length) {
        return;
      }

      setMarkingIds((current) => Array.from(new Set([...current, ...deduped])));

      try {
        const payload = deduped.length === 1 ? { alertId: deduped[0] } : { alertIds: deduped };
        const response = await fetch("/api/alerts/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await readJsonResponse(response);
        if (!response.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to mark alert as read"
          );
        }

        const idsSet = new Set(deduped);
        setAlerts((current) =>
          current.map((item) =>
            idsSet.has(item.id)
              ? {
                  ...item,
                  isRead: true
                }
              : item
          )
        );
      } catch (error) {
        toast({
          title: "Action failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive"
        });
      } finally {
        setMarkingIds((current) => current.filter((id) => !deduped.includes(id)));
      }
    },
    [toast]
  );

  const unreadCount = alerts.filter((item) => !item.isRead).length;
  const criticalCount = alerts.filter((item) => item.severity === "CRITICAL").length;
  const criticalUnreadCount = alerts.filter(
    (item) => item.severity === "CRITICAL" && !item.isRead
  ).length;

  const typeOptions = useMemo(
    () => Array.from(new Set(alerts.map((item) => item.type))).sort(),
    [alerts]
  );

  const visibleAlerts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = alerts.filter((item) => {
      if (severityFilter !== "ALL" && item.severity !== severityFilter) {
        return false;
      }

      if (statusFilter === "UNREAD" && item.isRead) {
        return false;
      }
      if (statusFilter === "READ" && !item.isRead) {
        return false;
      }

      if (typeFilter !== "ALL" && item.type !== typeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        item.product.sku.toLowerCase().includes(query) ||
        item.product.title.toLowerCase().includes(query) ||
        item.message.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query)
      );
    });

    filtered.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();

      if (sortMode === "OLDEST") {
        return aTime - bTime;
      }

      if (sortMode === "SEVERITY") {
        const severityDelta = severityRank[b.severity] - severityRank[a.severity];
        if (severityDelta !== 0) {
          return severityDelta;
        }
        return bTime - aTime;
      }

      return bTime - aTime;
    });

    return filtered;
  }, [alerts, search, severityFilter, statusFilter, typeFilter, sortMode]);

  const unreadVisibleIds = useMemo(
    () => visibleAlerts.filter((item) => !item.isRead).map((item) => item.id),
    [visibleAlerts]
  );

  const markVisibleRead = useCallback(async () => {
    if (!unreadVisibleIds.length) {
      return;
    }

    await markRead(unreadVisibleIds);
  }, [markRead, unreadVisibleIds]);

  const isMarking = useCallback((id: string) => markingIds.includes(id), [markingIds]);

  const resetFilters = () => {
    setSearch("");
    setSeverityFilter("ALL");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setSortMode("NEWEST");
  };

  const filtersActive =
    search.trim().length > 0 ||
    severityFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    sortMode !== "NEWEST";

  const hasUnreadVisible = unreadVisibleIds.length > 0;

  const markSingleRead = async (alertId: string) => {
    await markRead([alertId]);
  };

  const getRowClass = (isRead: boolean) => cn(!isRead && "bg-primary/5", "align-top");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Alerts</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{alerts.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Unread</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{unreadCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Critical</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{criticalCount}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Critical Unread</p>
            <p className="mt-1 text-2xl font-semibold text-destructive">{criticalUnreadCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Alerts</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {visibleAlerts.length} visible, {unreadVisibleIds.length} unread in current view.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadAlerts()}
                disabled={loading || refreshing}
              >
                <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
                Refresh
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void markVisibleRead()}
                disabled={!hasUnreadVisible || markingIds.length > 0}
              >
                <CheckCheck className="mr-2 h-4 w-4" />
                Mark Visible Read
              </Button>
            </div>
          </div>
          <div className="grid gap-2 pt-2 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative md:col-span-2 xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search SKU, title, message, type..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="UNREAD">Unread</SelectItem>
                <SelectItem value="READ">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value as SeverityFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Severities</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="WARN">Warn</SelectItem>
                <SelectItem value="INFO">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEWEST">Newest First</SelectItem>
                <SelectItem value="OLDEST">Oldest First</SelectItem>
                <SelectItem value="SEVERITY">Severity First</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Alert type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {typeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {formatType(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" onClick={resetFilters} disabled={!filtersActive}>
              Reset Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {warning ? (
            <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-400">
              {warning}
            </div>
          ) : null}

          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading alerts...</div>
          ) : visibleAlerts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No alerts found for current filters.
            </div>
          ) : (
            <Table className="min-w-[980px]">
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
                {visibleAlerts.map((alert) => {
                  const missingFields = extractMissingFields(alert.metadataJson);
                  return (
                    <TableRow key={alert.id} className={getRowClass(alert.isRead)}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <div>{formatRelativeDate(alert.createdAt)}</div>
                        <div className="mt-0.5 text-[11px]">{new Date(alert.createdAt).toLocaleString()}</div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="font-semibold text-foreground">{alert.product.sku}</div>
                        <div className="truncate text-xs text-muted-foreground" title={alert.product.title}>
                          {alert.product.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatType(alert.type)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={severityVariant[alert.severity]}>{alert.severity}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[420px]">
                        <div className="text-sm text-foreground">{alert.message}</div>
                        {missingFields.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {missingFields.map((field) => (
                              <Badge key={field} variant="warning">
                                Missing: {field}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {alert.isRead ? <Badge variant="secondary">Read</Badge> : <Badge>New</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={alert.isRead || isMarking(alert.id)}
                          onClick={() => void markSingleRead(alert.id)}
                        >
                          {isMarking(alert.id) ? "Saving..." : "Mark Read"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

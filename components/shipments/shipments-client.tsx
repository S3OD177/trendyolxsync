"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Loader2, RefreshCw, Package, ExternalLink, Radio } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils/cn";

interface ShipmentPackage {
    id: string;
    packageNumber: string;
    orderNumber: string | null;
    status: string;
    cargoProvider: string | null;
    trackingNumber: string | null;
    trackingLink: string | null;
    lastModifiedAt: string | null;
    linesCount: number | null;
    estimatedDeliveryStart: string | null;
}

const REFRESH_INTERVAL_MS = 30000; // 30 seconds

export default function ShipmentsClient() {
    const [data, setData] = useState<ShipmentPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefetching, setIsRefetching] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState("");
    const { toast } = useToast();
    const abortRef = useRef<AbortController | null>(null);
    const [nextUpdate, setNextUpdate] = useState<number>(Date.now() + REFRESH_INTERVAL_MS);
    const [timeLeft, setTimeLeft] = useState<number>(30);

    const fetchShipments = useCallback(async (searchTerm: string, isInitial = false) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        if (isInitial) setLoading(true);
        else setIsRefetching(true);

        try {
            const res = await fetch(
                `/api/shipments?search=${encodeURIComponent(searchTerm)}&limit=50`,
                { cache: "no-store", signal: controller.signal }
            );
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            setData(json.rows || []);
            setNextUpdate(Date.now() + REFRESH_INTERVAL_MS);
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            toast({ title: "Error", description: "Could not load shipments", variant: "destructive" });
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
                setIsRefetching(false);
            }
        }
    }, [toast]);

    const syncShipments = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/cron/sync-shipments", {
                method: "POST",
                body: JSON.stringify({ lookbackHours: 24 }),
                headers: { "Content-Type": "application/json" }
            });
            if (!res.ok) throw new Error("Sync failed");
            toast({ title: "Sync Started", description: "Checking for new shipments..." });
            // Small delay to allow backend to start processing, then fetch
            setTimeout(() => fetchShipments(search), 2000);
        } catch (err) {
            toast({ title: "Error", description: "Sync failed", variant: "destructive" });
        } finally {
            setSyncing(false);
        }
    };

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            // Only show loading spinner on table if we have no data yet
            // otherwise just refetch quietly
            const isInitial = data.length === 0 && loading;
            fetchShipments(search, isInitial);
        }, 300);
        return () => clearTimeout(timer);
    }, [search, fetchShipments, data.length, loading]);

    // Live Countdown Timer
    useEffect(() => {
        const timer = setInterval(() => {
            const msRemaining = nextUpdate - Date.now();
            const secRemaining = Math.max(0, Math.ceil(msRemaining / 1000));
            setTimeLeft(secRemaining);

            if (msRemaining <= 0) {
                fetchShipments(search);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [nextUpdate, search, fetchShipments]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case "Created": return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20";
            case "Picking": return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
            case "Invoiced": return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20";
            case "Shipped": return "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
            case "Delivered": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
            case "Cancelled": return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
            case "Returned": return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/20";
            default: return "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20";
        }
    };

    const summary = useMemo(() => {
        const total = data.length;
        const inProgress = data.filter((row) => ["Created", "Picking", "Invoiced"].includes(row.status)).length;
        const shipped = data.filter((row) => row.status === "Shipped").length;
        const delivered = data.filter((row) => row.status === "Delivered").length;
        const issues = data.filter((row) => ["Cancelled", "Returned"].includes(row.status)).length;
        return { total, inProgress, shipped, delivered, issues };
    }, [data]);

    return (
        <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-black/60 p-6 shadow-[0_28px_80px_-60px_rgba(0,0,0,0.9)] md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
                            <Radio className="h-3.5 w-3.5" />
                            Live shipments
                        </div>
                        <h1 className="text-3xl font-semibold text-foreground">Shipments</h1>
                        <p className="text-sm text-muted-foreground">
                            Track and manage Trendyol shipment packages in near real time.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Badge
                            variant="outline"
                            className="gap-1.5 py-1 px-3 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-normal"
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Live Updates
                        </Badge>
                        <span className="text-xs text-muted-foreground font-medium tabular-nums">
                            Next update in {timeLeft}s
                        </span>
                        <Button
                            size="sm"
                            onClick={syncShipments}
                            disabled={syncing}
                            variant="outline"
                            className={cn("transition-all", syncing && "border-primary/50 bg-primary/5")}
                        >
                            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", (syncing || isRefetching) && "animate-spin")} />
                            {syncing ? "Syncing..." : "Sync Now"}
                        </Button>
                    </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-5">
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">{summary.total}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">In Progress</p>
                        <p className="mt-2 text-2xl font-semibold text-amber-400">{summary.inProgress}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Shipped</p>
                        <p className="mt-2 text-2xl font-semibold text-blue-400">{summary.shipped}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Delivered</p>
                        <p className="mt-2 text-2xl font-semibold text-emerald-400">{summary.delivered}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Issues</p>
                        <p className="mt-2 text-2xl font-semibold text-red-400">{summary.issues}</p>
                    </div>
                </div>
            </div>

            <Card className="border-white/10 bg-black/50">
                <CardContent className="p-6">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Shipment Packages</h2>
                            <p className="text-sm text-muted-foreground">{data.length} packages found.</p>
                        </div>
                        <Input
                            placeholder="Search package number, order number, tracking..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="max-w-sm"
                        />
                    </div>

                    <div className="w-full overflow-x-auto rounded-xl border border-white/10">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Package No</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Cargo</TableHead>
                                    <TableHead>Lines</TableHead>
                                    <TableHead>Dates</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading && data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            No shipments found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    data.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex flex-col">
                                                    <span>{row.packageNumber}</span>
                                                    <span className="text-xs text-muted-foreground">{row.orderNumber}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={getStatusColor(row.status)}>
                                                    {row.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-sm">
                                                    <span>{row.cargoProvider || "-"}</span>
                                                    <span className="text-xs text-muted-foreground tracking-wider">{row.trackingNumber || ""}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    <Package className="h-3 w-3 text-muted-foreground" />
                                                    <span>{row.linesCount}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-xs text-muted-foreground">
                                                    <span>Updated: {row.lastModifiedAt ? new Date(row.lastModifiedAt).toLocaleDateString() : "-"}</span>
                                                    <span>Est: {row.estimatedDeliveryStart ? new Date(row.estimatedDeliveryStart).toLocaleDateString() : "-"}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {row.trackingLink && (
                                                    <a
                                                        href={row.trackingLink}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                    </a>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Loader2, RefreshCw, Package, ExternalLink, Truck } from "lucide-react";
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

export default function ShipmentsClient() {
    const [data, setData] = useState<ShipmentPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState("");
    const { toast } = useToast();
    const abortRef = useRef<AbortController | null>(null);

    const fetchShipments = useCallback(async (searchTerm: string) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        try {
            const res = await fetch(
                `/api/shipments?search=${encodeURIComponent(searchTerm)}&limit=50`,
                { cache: "no-store", signal: controller.signal }
            );
            if (!res.ok) throw new Error("Failed");
            const json = await res.json();
            setData(json.rows || []);
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            toast({ title: "Error", description: "Could not load shipments", variant: "destructive" });
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
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
            setTimeout(() => fetchShipments(search), 2000);
        } catch (err) {
            toast({ title: "Error", description: "Sync failed", variant: "destructive" });
        } finally {
            setSyncing(false);
        }
    };

    // Debounce search to avoid fetching on every keystroke
    useEffect(() => {
        const timer = setTimeout(() => fetchShipments(search), 300);
        return () => clearTimeout(timer);
    }, [search, fetchShipments]);

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

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Shipments</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Track and manage your Trendyol shipments. {data.length > 0 && `${data.length} packages found.`}
                    </p>
                </div>
                <Button
                    size="sm"
                    onClick={syncShipments}
                    disabled={syncing}
                >
                    {syncing ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    )}
                    Sync Now
                </Button>
            </div>

            <Card>
                <CardContent className="p-6">
                    <div className="mb-4">
                        <Input
                            placeholder="Search package number, order number, tracking..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="max-w-sm"
                        />
                    </div>

                    <div className="rounded-xl border border-border/40 overflow-hidden">
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
                                {loading ? (
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

// Remove unused imports


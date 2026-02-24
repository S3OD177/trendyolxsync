
"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { RefreshCw, Search, Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface ReturnItem {
    id: string;
    sku: string;
    quantity: number;
    reason: string | null;
}

interface ReturnRequest {
    id: string;
    claimId: string;
    orderNumber: string | null;
    dateTime: string | Date;
    reason: string;
    status: string;
    returnStatus: string | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    items: ReturnItem[];
}

export function ReturnsClient({ initialReturns }: { initialReturns: ReturnRequest[] }) {
    const [returns, setReturns] = useState<ReturnRequest[]>(initialReturns);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const { toast } = useToast();
    const router = useRouter();

    useEffect(() => {
        const syncOnLoad = async () => {
            // Sync if empty or just always for "live" feel as requested
            if (initialReturns.length === 0) {
                await handleSync(true);
            }
        };
        syncOnLoad();
    }, []);

    const handleSync = async (silent = false) => {
        setLoading(true);
        try {
            const res = await fetch("/api/returns/sync", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            if (!silent) {
                toast({ title: "Sync successful", description: `Synced ${data.totalSynced} returns.` });
            }
            router.refresh();
        } catch (error) {
            if (!silent) {
                toast({
                    title: "Sync failed",
                    description: error instanceof Error ? error.message : "Unknown error",
                    variant: "destructive"
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const filteredReturns = returns.filter(
        (req) =>
            req.orderNumber?.toLowerCase().includes(search.toLowerCase()) ||
            (req.customerFirstName?.toLowerCase() || "").includes(search.toLowerCase()) ||
            (req.customerLastName?.toLowerCase() || "").includes(search.toLowerCase())
    );

    const getStatusBadgeVariant = (status: string) => {
        switch (status.toLowerCase()) {
            case "approved": return "default"; // or success color if available
            case "rejected": return "destructive";
            case "created": return "secondary";
            default: return "outline";
        }
    };

    const summary = useMemo(() => {
        const total = returns.length;
        const approved = returns.filter((req) => /approved/i.test(req.status)).length;
        const rejected = returns.filter((req) => /rejected|denied/i.test(req.status)).length;
        const pending = returns.filter((req) => /created|pending|waiting/i.test(req.status)).length;
        return { total, approved, rejected, pending };
    }, [returns]);

    return (
        <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-black/60 p-6 shadow-[0_28px_80px_-60px_rgba(0,0,0,0.9)] md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Returns & claims
                        </div>
                        <h1 className="text-3xl font-semibold text-foreground">Returns & Claims</h1>
                        <p className="text-sm text-muted-foreground">Track customer return requests and claim status.</p>
                    </div>
                    <Button onClick={() => handleSync(false)} disabled={loading} variant="outline">
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Sync Returns
                    </Button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Claims</p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">{summary.total}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
                        <p className="mt-2 text-2xl font-semibold text-amber-400">{summary.pending}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved</p>
                        <p className="mt-2 text-2xl font-semibold text-emerald-400">{summary.approved}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Rejected</p>
                        <p className="mt-2 text-2xl font-semibold text-red-400">{summary.rejected}</p>
                    </div>
                </div>
            </div>

            <Card className="border-white/10 bg-black/50">
                <CardHeader>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle>Recent Claims</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">{filteredReturns.length} claims in view.</p>
                        </div>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search order or customer..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="w-full overflow-x-auto rounded-md border border-white/10">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Claim / Order</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Items</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredReturns.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            No returns found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredReturns.map((req) => (
                                        <TableRow key={req.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{req.claimId}</span>
                                                    <span className="text-xs text-muted-foreground">{req.orderNumber}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    {format(new Date(req.dateTime), "MMM d, yyyy")}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {req.customerFirstName} {req.customerLastName}
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate" title={req.reason}>
                                                {req.reason}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant={getStatusBadgeVariant(req.status)}>{req.status}</Badge>
                                                    {req.returnStatus && req.returnStatus !== req.status && (
                                                        <span className="text-[10px] text-muted-foreground">Shipment: {req.returnStatus}</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    {req.items.map((item) => (
                                                        <span key={item.id} className="text-sm">
                                                            {item.quantity}x {item.sku}
                                                        </span>
                                                    ))}
                                                </div>
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

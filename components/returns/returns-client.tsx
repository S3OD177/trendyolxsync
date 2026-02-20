
"use client";

import { useState, useEffect } from "react";
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

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Returns & Claims</h1>
                    <p className="text-muted-foreground">Manage customer return requests.</p>
                </div>
                <Button onClick={() => handleSync(false)} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Sync Returns
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Recent Claims</CardTitle>
                        <div className="relative w-64">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search order or customer..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
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

"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { RefreshCw, Search, Package, Calendar } from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface OrderItem {
    id: string;
    productName: string;
    sku: string;
    quantity: number;
    price: number;
}

interface Order {
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number;
    currency: string;
    customerFirstName: string | null;
    customerLastName: string | null;
    createdDate: string | Date;
    items: OrderItem[];
}

export function OrdersClient({ initialOrders }: { initialOrders: Order[] }) {
    const [orders, setOrders] = useState<Order[]>(initialOrders);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    // Auto-sync on mount
    useEffect(() => {
        const syncOnLoad = async () => {
            if (initialOrders.length === 0) {
                await handleSync(true); // Silent sync
            }
        };
        syncOnLoad();
    }, []);

    const handleSync = async (silent = false) => {
        setLoading(true);
        try {
            const res = await fetch("/api/orders/sync", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            if (!silent) {
                toast({ title: "Sync successful", description: `Synced ${data.totalSynced} orders.` });
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

    const filteredOrders = orders.filter(
        (order) =>
            order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            (order.customerFirstName?.toLowerCase() || "").includes(search.toLowerCase()) ||
            (order.customerLastName?.toLowerCase() || "").includes(search.toLowerCase())
    );

    const summary = useMemo(() => {
        const total = orders.length;
        const items = orders.reduce((count, order) => count + order.items.reduce((sum, item) => sum + item.quantity, 0), 0);
        const pending = orders.filter((order) => /created|pending|waiting|new/i.test(order.status)).length;
        const fulfilled = orders.filter((order) => /shipped|delivered|completed/i.test(order.status)).length;
        return { total, items, pending, fulfilled };
    }, [orders]);

    return (
        <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-black/60 p-6 shadow-[0_28px_80px_-60px_rgba(0,0,0,0.9)] md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
                            <Package className="h-3.5 w-3.5" />
                            Orders feed
                        </div>
                        <h1 className="text-3xl font-semibold text-foreground">Orders</h1>
                        <p className="text-sm text-muted-foreground">Manage and track your Trendyol orders in real time.</p>
                    </div>
                    <Button onClick={() => handleSync(false)} disabled={loading} variant="outline">
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Sync Orders
                    </Button>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Orders</p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">{summary.total}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
                        <p className="mt-2 text-2xl font-semibold text-amber-400">{summary.pending}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Fulfilled</p>
                        <p className="mt-2 text-2xl font-semibold text-emerald-400">{summary.fulfilled}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Items</p>
                        <p className="mt-2 text-2xl font-semibold text-foreground">{summary.items}</p>
                    </div>
                </div>
            </div>

            <Card className="border-white/10 bg-black/50">
                <CardHeader>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <CardTitle>Recent Orders</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">{filteredOrders.length} orders in view.</p>
                        </div>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search orders..."
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
                                    <TableHead className="w-[100px]">Order #</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Items</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOrders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">
                                            No orders found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredOrders.map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-medium cursor-pointer hover:underline" onClick={() => setSelectedOrder(order)}>
                                                {order.orderNumber}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    {format(new Date(order.createdDate), "MMM d, yyyy")}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {order.customerFirstName} {order.customerLastName}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{order.status}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    {order.items.map((item) => (
                                                        <span key={item.id} className="text-sm truncate max-w-[200px]" title={item.productName}>
                                                            {item.quantity}x {item.sku}
                                                        </span>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">
                                                {Number(order.totalPrice).toFixed(2)} {order.currency}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Order Details #{selectedOrder?.orderNumber}</DialogTitle>
                        <DialogDescription>
                            Date: {selectedOrder?.createdDate && format(new Date(selectedOrder.createdDate), "PPP p")}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedOrder && (
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-muted-foreground">Customer</h4>
                                    <p>{selectedOrder.customerFirstName} {selectedOrder.customerLastName}</p>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-muted-foreground">Status</h4>
                                    <Badge>{selectedOrder.status}</Badge>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-medium text-sm text-muted-foreground">Total</h4>
                                    <p className="font-bold text-lg">{Number(selectedOrder.totalPrice).toFixed(2)} {selectedOrder.currency}</p>
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t">
                                <h4 className="font-medium leading-none">Items ({selectedOrder.items.length})</h4>
                                <div className="space-y-4">
                                    {selectedOrder.items.map((item) => (
                                        <div key={item.id} className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0">
                                            <div className="space-y-1">
                                                <p className="font-medium text-sm">{item.productName}</p>
                                                <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                                            </div>
                                            <div className="text-right text-sm">
                                                <p>{item.quantity} x {Number(item.price).toFixed(2)}</p>
                                                <p className="font-medium">{(item.quantity * Number(item.price)).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

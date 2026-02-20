
"use client";

import { useEffect, useState } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, Package } from "lucide-react";

interface AnalyticsData {
    salesHistory: { date: string; sales: number; count: number }[];
    topProducts: { sku: string; name: string; quantity: number; revenue: number }[];
    stats: { totalOrders: number; activeProducts: number; buyboxWinRate: number };
}

export function AnalyticsCharts() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/analytics")
            .then((res) => res.json())
            .then((data) => {
                // Transform date for better display
                if (data.salesHistory) {
                    data.salesHistory = data.salesHistory.map((item: any) => ({
                        ...item,
                        displayDate: new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                    }));
                }
                setData(data);
            })
            .catch((err) => console.error(err))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex h-[300px] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!data || !data.stats || !data.salesHistory) return null;

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Sales Over Time</CardTitle>
                    <CardDescription>
                        Revenue for the last 30 days.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pl-2">
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.salesHistory}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="displayDate"
                                    stroke="#888888"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    stroke="#888888"
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `$${value}`}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "var(--background)", borderRadius: "8px" }}
                                    itemStyle={{ color: "var(--foreground)" }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="sales"
                                    stroke="hsl(var(--primary))"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>

            <Card className="col-span-3">
                <CardHeader>
                    <CardTitle>Top Products</CardTitle>
                    <CardDescription>
                        Best selling items by quantity.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-8">
                        {data.topProducts && data.topProducts.length > 0 ? (
                            data.topProducts.map((product) => (
                                <div key={product.sku} className="flex items-center">
                                    <div className="ml-4 space-y-1">
                                        <p className="text-sm font-medium leading-none">{product.name}</p>
                                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                                    </div>
                                    <div className="ml-auto font-medium">+{product.quantity} sold</div>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-muted-foreground">No top products found.</div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="col-span-7 grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.stats.totalOrders}</div>
                        <p className="text-xs text-muted-foreground">
                            Lifetime orders synced
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">BuyBox Win Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.stats.buyboxWinRate.toFixed(1)}%</div>
                        <p className="text-xs text-muted-foreground">
                            Based on latest snapshots
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Products</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{data.stats.activeProducts}</div>
                        <p className="text-xs text-muted-foreground">
                            Currently monitored
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

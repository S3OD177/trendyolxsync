"use strict";

import { useEffect, useState } from "react";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp } from "lucide-react";
import { formatSar } from "@/lib/utils/money";

interface CompetitorLog {
    id: string;
    competitorName: string;
    price: number; // Decimal in DB, number in JSON
    isBuyBoxWinner: boolean;
    checkedAt: string;
}

interface CompetitorPriceChartProps {
    productId: string;
}

export function CompetitorPriceChart({ productId }: CompetitorPriceChartProps) {
    const [data, setData] = useState<CompetitorLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/products/${productId}/competitor-logs`);
                const json = await res.json();
                if (json.logs) {
                    // Format data for chart
                    const formatted = json.logs.map((log: any) => ({
                        ...log,
                        price: Number(log.price),
                        formattedDate: new Date(log.checkedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                        }),
                    }));
                    setData(formatted);
                }
            } catch (error) {
                console.error("Failed to load competitor logs", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [productId]);

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Competitor Price History</CardTitle>
                    <CardDescription>Loading historical data...</CardDescription>
                </CardHeader>
                <CardContent className="flex h-[300px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    if (data.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Competitor Price History</CardTitle>
                    <CardDescription>No competitor data recorded yet.</CardDescription>
                </CardHeader>
                <CardContent className="flex h-[300px] items-center justify-center text-muted-foreground">
                    Waiting for first price check...
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Competitor Price History
                </CardTitle>
                <CardDescription>
                    Tracking BuyBox price changes over time.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                            <XAxis
                                dataKey="formattedDate"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value} SAR`}
                                domain={['auto', 'auto']}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const item = payload[0].payload as CompetitorLog;
                                        return (
                                            <div className="rounded-lg border border-white/10 bg-black/80 p-2 shadow-sm backdrop-blur-xl">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="flex flex-col">
                                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                            Date
                                                        </span>
                                                        <span className="font-bold text-muted-foreground">
                                                            {label}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                            Price
                                                        </span>
                                                        <span className="font-bold">
                                                            {formatSar(item.price)}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col col-span-2">
                                                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                            Competitor
                                                        </span>
                                                        <span className="font-bold text-primary">
                                                            {item.competitorName}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Line
                                type="stepAfter"
                                dataKey="price"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                dot={{ r: 4, fill: "hsl(var(--primary))" }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

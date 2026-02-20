
import { prisma as db } from "@/lib/db/prisma";
import { startOfDay, subDays, format } from "date-fns";

export class AnalyticsService {
    /**
     * Get sales data for the last N days
     */
    async getSalesHistory(days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const sales = await db.order.findMany({
            where: {
                createdDate: {
                    gte: startDate,
                },
                status: { not: "Cancelled" }, // Exclude cancelled orders
            },
            select: {
                createdDate: true,
                totalPrice: true,
            },
            orderBy: {
                createdDate: "asc",
            },
        });

        // Group by date
        const salesByDate = new Map<string, { sales: number; count: number }>();

        // Initialize all dates in range to 0
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            salesByDate.set(dateStr, { sales: 0, count: 0 });
        }

        sales.forEach(order => {
            const dateStr = order.createdDate.toISOString().split('T')[0];
            if (salesByDate.has(dateStr)) {
                const current = salesByDate.get(dateStr)!;
                salesByDate.set(dateStr, {
                    sales: current.sales + Number(order.totalPrice),
                    count: current.count + 1,
                });
            }
        });

        return Array.from(salesByDate.entries())
            .map(([date, data]) => ({
                date,
                sales: data.sales,
                count: data.count,
            }))
            // Sort by date ascending
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Get top selling products by quantity
     */
    async getTopProducts(limit = 5) {
        // Prisma doesn't support easy grouping on relations yet without groupBy, 
        // but groupBy doesn't include relation fields.
        // We'll fetch items and aggregate in memory for simplicity or use groupBy if we just need SKU.

        const items = await db.orderItem.groupBy({
            by: ["sku"],
            _sum: {
                quantity: true,
                price: true,
            },
            where: {
                order: {
                    status: {
                        notIn: ["Cancelled", "Returned"],
                    }
                }
            },
            orderBy: {
                _sum: {
                    quantity: "desc",
                },
            },
            take: limit,
        });

        // Fetch product details for these SKUs
        const skus = items.map(i => i.sku);
        const products = await db.product.findMany({
            where: { sku: { in: skus } },
            select: { sku: true, title: true },
        });

        return items.map(item => {
            const product = products.find(p => p.sku === item.sku);
            return {
                sku: item.sku,
                name: product?.title || item.sku,
                quantity: item._sum.quantity || 0,
                revenue: Number(item._sum.price || 0),
            };
        });
    }

    /**
     * Get overall stats
     */
    async getStats() {
        const totalOrders = await db.order.count();
        const totalProducts = await db.product.count({ where: { active: true } });

        // Calculate BuyBox Win Rate
        const snapshots = await db.priceSnapshot.findMany({
            distinct: ["productId"],
            orderBy: { checkedAt: "desc" },
            select: { buyboxStatus: true },
        });

        const winCount = snapshots.filter(s => s.buyboxStatus === "WIN").length;
        const winRate = snapshots.length > 0 ? (winCount / snapshots.length) * 100 : 0;

        return {
            totalOrders,
            activeProducts: totalProducts,
            buyboxWinRate: winRate,
        };
    }
}

export const analyticsService = new AnalyticsService();


import { NextResponse } from "next/server";
import { analyticsService } from "@/lib/services/analytics-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const range = searchParams.get("range");
        const days = range ? parseInt(range) : 30;

        const [salesHistory, topProducts, stats] = await Promise.all([
            analyticsService.getSalesHistory(days),
            analyticsService.getTopProducts(10), // Increased limit for top products
            analyticsService.getStats(),
        ]);

        return NextResponse.json({
            salesHistory,
            topProducts,
            stats,
        });
    } catch (error) {
        console.error("Analytics fetch failed:", error);
        return NextResponse.json(
            { error: "Failed to fetch analytics data" },
            { status: 500 }
        );
    }
}

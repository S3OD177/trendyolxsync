
import { NextResponse } from "next/server";
import { orderService } from "@/lib/services/order-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const { totalSynced } = await orderService.syncOrders();
        return NextResponse.json({ ok: true, totalSynced });
    } catch (error) {
        console.error("Order sync failed:", error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

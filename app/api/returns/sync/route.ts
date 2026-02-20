
import { NextResponse } from "next/server";
import { returnService } from "@/lib/services/return-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const { totalSynced } = await returnService.syncReturns();
        return NextResponse.json({ ok: true, totalSynced });
    } catch (error) {
        console.error("Return sync failed:", error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

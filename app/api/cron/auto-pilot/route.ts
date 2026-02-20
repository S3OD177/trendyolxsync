import { NextResponse } from "next/server";
import { runAutoPilot } from "@/lib/jobs/auto-pilot";

export const dynamic = "force-dynamic";

export async function POST() {
    try {
        const result = await runAutoPilot();
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

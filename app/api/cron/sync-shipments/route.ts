import { NextRequest, NextResponse } from "next/server";
import { acquireJobLock, releaseJobLock } from "@/lib/jobs/lock";
import { syncShipmentsJob } from "@/lib/jobs/sync-shipments";
import { env } from "@/lib/config/env";
import { PIN_COOKIE_NAME } from "@/lib/auth/pin";

export const dynamic = "force-dynamic";

const LOCK_NAME = "shipment_sync_job";

export async function POST(request: NextRequest) {
    const secret =
        request.headers.get("x-cron-secret") ||
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const hasPinSession = request.cookies.get(PIN_COOKIE_NAME)?.value === "1";

    // Allow if cron secret matches OR if user has valid dashboard session
    if ((!secret || secret !== env.CRON_SECRET) && !hasPinSession) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const owner = crypto.randomUUID();
    // Short lock time (e.g. 5 minutes)
    const acquired = await acquireJobLock(LOCK_NAME, owner, 300);

    if (!acquired) {
        return NextResponse.json({ ok: true, skipped: true, message: "Sync job already running" });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const summary = await syncShipmentsJob({
            lookbackHours: body.lookbackHours ?? 24,
            forceFull: body.forceFull ?? false
        });

        return NextResponse.json({ ok: true, ...summary });
    } catch (error) {
        console.error("Shipment sync failed:", error);
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
            { status: 500 }
        );
    } finally {
        await releaseJobLock(LOCK_NAME, owner);
    }
}

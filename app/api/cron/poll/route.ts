import { NextRequest, NextResponse } from "next/server";
import { acquireJobLock, releaseJobLock } from "@/lib/jobs/lock";
import { runPoll } from "@/lib/jobs/poll-products";
import { env } from "@/lib/config/env";
import { PIN_COOKIE_NAME } from "@/lib/auth/pin";

const LOCK_NAME = "poll_job";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const hasPinSession = request.cookies.get(PIN_COOKIE_NAME)?.value === "1";

  if ((!secret || secret !== env.CRON_SECRET) && !hasPinSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owner = crypto.randomUUID();
  const acquired = await acquireJobLock(LOCK_NAME, owner, 240);

  if (!acquired) {
    return NextResponse.json({ ok: true, skipped: true, message: "Poll job already running" });
  }

  try {
    const summary = await runPoll();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Poll failed" },
      { status: 500 }
    );
  } finally {
    await releaseJobLock(LOCK_NAME, owner);
  }
}

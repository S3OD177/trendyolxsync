import { NextResponse } from "next/server";
import { acquireJobLock, releaseJobLock } from "@/lib/jobs/lock";
import { runPoll } from "@/lib/jobs/poll-products";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";

const LOCK_NAME = "poll_job";

export const dynamic = "force-dynamic";

export async function POST() {
  const owner = crypto.randomUUID();
  const acquired = await acquireJobLock(LOCK_NAME, owner, 240);

  if (!acquired) {
    return NextResponse.json(
      { ok: true, skipped: true, message: "Poll job already running" },
      { headers: NO_STORE_HEADERS }
    );
  }

  try {
    const summary = await runPoll();
    return NextResponse.json(summary, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Poll failed" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  } finally {
    await releaseJobLock(LOCK_NAME, owner);
  }
}

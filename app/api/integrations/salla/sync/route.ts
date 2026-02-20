import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { sallaClient } from "@/lib/salla/client";
import { runSallaBatchSync } from "@/lib/salla/sync";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  activeOnly: z.boolean().default(true),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
  persist: z.boolean().default(true),
  dryRun: z.boolean().default(false)
});

export async function POST(request: NextRequest) {
  if (!sallaClient.isConfigured()) {
    return NextResponse.json(
      { error: "Salla is not configured. Set SALLA_ACCESS_TOKEN." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const summary = await runSallaBatchSync(parsed.data);
    return NextResponse.json(summary, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Salla sync failed unexpectedly"
      },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}

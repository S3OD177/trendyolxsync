import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { trendyolClient } from "@/lib/trendyol/client";
import { syncCatalogFromTrendyol } from "@/lib/trendyol/sync-catalog";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  maxPages: z.number().int().min(1).max(50).default(5),
  pageSize: z.number().int().min(1).max(200).default(50),
  hydratePrices: z.boolean().default(true),
  hydrateLimit: z.number().int().min(0).max(500).default(150),
  createInitialSnapshots: z.boolean().default(true)
});

export async function POST(request: NextRequest) {
  try {
    if (!trendyolClient.isConfigured()) {
      return NextResponse.json(
        { error: "Trendyol credentials are not configured" },
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

    const summary = await syncCatalogFromTrendyol(parsed.data);

    return NextResponse.json(
      {
        ok: true,
        ...summary,
        sellerId: trendyolClient.getSellerId(),
        storeFrontCode: trendyolClient.getStoreFrontCode()
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed unexpectedly",
        sellerId: trendyolClient.getSellerId(),
        storeFrontCode: trendyolClient.getStoreFrontCode()
      },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}

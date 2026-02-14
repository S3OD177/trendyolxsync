import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { buildDashboardRows } from "@/lib/dashboard/service";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { trendyolClient } from "@/lib/trendyol/client";
import { syncCatalogFromTrendyol } from "@/lib/trendyol/sync-catalog";

export const dynamic = "force-dynamic";

const parseBooleanParam = z
  .union([z.boolean(), z.literal("true"), z.literal("false")])
  .transform((value) => value === true || value === "true")
  .optional();

const querySchema = z.object({
  lostBuyboxOnly: parseBooleanParam,
  lowMarginRisk: parseBooleanParam,
  search: z.string().optional(),
  sort: z.enum(["latest", "largest_delta", "low_margin"]).optional()
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const query = parsed.data;

    if (env.AUTO_SYNC_CATALOG && trendyolClient.isConfigured()) {
      const productCount = await prisma.product.count();
      if (productCount === 0) {
        try {
          await syncCatalogFromTrendyol({
            maxPages: env.AUTO_SYNC_MAX_PAGES,
            pageSize: env.AUTO_SYNC_PAGE_SIZE,
            hydratePrices: true,
            hydrateLimit: 100,
            createInitialSnapshots: true
          });
        } catch {
          // Best-effort bootstrap; dashboard should still render.
        }
      }
    }

    let rows = await buildDashboardRows();

    if (query.search) {
      const term = query.search.toLowerCase();
      rows = rows.filter(
        (row) => row.sku.toLowerCase().includes(term) || row.title.toLowerCase().includes(term)
      );
    }

    if (query.lostBuyboxOnly) {
      rows = rows.filter((row) => row.buyboxStatus === "LOSE");
    }

    if (query.lowMarginRisk) {
      rows = rows.filter((row) => row.lowMarginRisk);
    }

    if (query.sort === "largest_delta") {
      rows = rows.sort((a, b) => (b.deltaSar ?? 0) - (a.deltaSar ?? 0));
    } else if (query.sort === "low_margin") {
      rows = rows.sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0));
    } else {
      rows = rows.sort((a, b) => {
        const aTime = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0;
        const bTime = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0;
        return bTime - aTime;
      });
    }

    return NextResponse.json({ rows }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to build dashboard data";

    return NextResponse.json(
      {
        error: errorMessage.includes("does not exist")
          ? `${errorMessage}. Run Prisma migrations on production database.`
          : errorMessage
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

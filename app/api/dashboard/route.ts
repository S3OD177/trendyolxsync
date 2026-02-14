import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDashboardRows } from "@/lib/dashboard/service";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  lostBuyboxOnly: z.coerce.boolean().optional(),
  lowMarginRisk: z.coerce.boolean().optional(),
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

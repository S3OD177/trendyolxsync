import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDashboardRows } from "@/lib/dashboard/service";

const querySchema = z.object({
  lostBuyboxOnly: z.coerce.boolean().optional(),
  lowMarginRisk: z.coerce.boolean().optional(),
  search: z.string().optional(),
  sort: z.enum(["latest", "largest_delta", "low_margin"]).optional()
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

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

  return NextResponse.json({ rows });
}

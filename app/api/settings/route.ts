import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { formatApiError, isDatabaseUnavailableError } from "@/lib/db/errors";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { getOrCreateGlobalSettings } from "@/lib/pricing/effective-settings";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  commissionRate: z.number().min(0).max(1),
  serviceFeeType: z.enum(["FIXED", "PERCENT"]),
  serviceFeeValue: z.number().min(0),
  shippingCost: z.number().min(0),
  handlingCost: z.number().min(0),
  vatRate: z.number().min(0).max(100),
  vatMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]),
  minProfitType: z.enum(["SAR", "PERCENT"]),
  minProfitValue: z.number().min(0),
  undercutStep: z.number().min(0),
  alertThresholdSar: z.number().min(0),
  alertThresholdPct: z.number().min(0),
  cooldownMinutes: z.number().int().min(1),
  competitorDropPct: z.number().min(0)
});

function integrationStatus() {
  return {
    trendyolConfigured: !!(
      (env.TRENDYOL_SUPPLIER_ID || env.TRENDYOL_SELLER_ID) &&
      env.TRENDYOL_API_KEY &&
      env.TRENDYOL_API_SECRET
    )
  };
}

function toErrorMessage(error: unknown) {
  return formatApiError(error, "Failed to load settings");
}

function fallbackSettings() {
  return {
    currency: "SAR",
    commissionRate: 0.15,
    serviceFeeType: "PERCENT",
    serviceFeeValue: 0,
    shippingCost: 0,
    handlingCost: 0,
    vatRate: 15,
    vatMode: "INCLUSIVE",
    minProfitType: "SAR",
    minProfitValue: 0,
    undercutStep: 0.5,
    alertThresholdSar: 2,
    alertThresholdPct: 1,
    cooldownMinutes: 15,
    competitorDropPct: 3
  };
}

export async function GET() {
  try {
    const settings = await getOrCreateGlobalSettings();
    return NextResponse.json({ settings, integrations: integrationStatus() }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        {
          settings: fallbackSettings(),
          integrations: integrationStatus(),
          warning:
            "Database is unreachable. Showing fallback defaults until DATABASE_URL networking is fixed."
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const current = await getOrCreateGlobalSettings();

    const settings = await prisma.globalSettings.update({
      where: { id: current.id },
      data: parsed.data
    });

    return NextResponse.json(
      { ok: true, settings, integrations: integrationStatus() },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { error: "Database is unreachable. Save is unavailable until connectivity is restored." },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
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
  if (error instanceof Error) {
    const message = error.message.includes("does not exist")
      ? `${error.message}. Run Prisma migrations on production database.`
      : error.message;
    return message;
  }

  return "Failed to load settings";
}

export async function GET(request: NextRequest) {
  try {
    const settings = await getOrCreateGlobalSettings();
    return NextResponse.json({ settings, integrations: integrationStatus() }, { headers: NO_STORE_HEADERS });
  } catch (error) {
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
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500, headers: NO_STORE_HEADERS });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/guards";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { getOrCreateGlobalSettings } from "@/lib/pricing/effective-settings";

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
    ),
    smtpConfigured: !!(
      env.SMTP_HOST &&
      env.SMTP_PORT &&
      env.SMTP_USER &&
      env.SMTP_PASS &&
      env.ALERT_EMAIL_TO
    ),
    telegramConfigured: !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)
  };
}

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getOrCreateGlobalSettings();

  return NextResponse.json({ settings, integrations: integrationStatus() });
}

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const current = await getOrCreateGlobalSettings();

  const settings = await prisma.globalSettings.update({
    where: { id: current.id },
    data: parsed.data
  });

  return NextResponse.json({ ok: true, settings, integrations: integrationStatus() });
}

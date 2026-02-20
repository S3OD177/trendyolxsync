import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { normalizeFeeRate } from "@/lib/pricing/calculator";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  costPrice: z.number().min(0),
  feePercent: z.number().min(0).optional(),
  commissionRate: z.number().min(0).nullable().optional(),
  serviceFeeType: z.enum(["FIXED", "PERCENT"]).nullable().optional(),
  serviceFeeValue: z.number().min(0).nullable().optional(),
  shippingCost: z.number().min(0).nullable().optional(),
  handlingCost: z.number().min(0).nullable().optional(),
  vatRate: z.number().min(0).max(100).nullable().optional(),
  vatMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]).nullable().optional(),
  minProfitType: z.enum(["SAR", "PERCENT"]).nullable().optional(),
  minProfitValue: z.number().min(0).nullable().optional(),
  undercutStep: z.number().min(0).nullable().optional(),
  alertThresholdSar: z.number().min(0).nullable().optional(),
  alertThresholdPct: z.number().min(0).nullable().optional(),
  cooldownMinutes: z.number().int().min(1).nullable().optional(),
  competitorDropPct: z.number().min(0).nullable().optional(),
  autoPilot: z.boolean().optional(),
  minPrice: z.number().min(0).nullable().optional(),
  strategy: z.enum(["MATCH", "BEAT_BY_1", "BEAT_BY_5"]).optional()
});

function toFeePercentValue(rate: unknown) {
  const value = Number(rate ?? 0);
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value < 1 ? value * 100 : value;
}

function decorateSettingsWithFeePercent<T extends Record<string, unknown> | null>(settings: T) {
  if (!settings) {
    return settings;
  }

  return {
    ...settings,
    feePercent: toFeePercentValue(settings.commissionRate)
  };
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { settings: true }
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ settings: decorateSettingsWithFeePercent(product.settings as unknown as Record<string, unknown> | null) });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const payload = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const exists = await prisma.product.findUnique({ where: { id: params.id } });

  if (!exists) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { autoPilot, minPrice, strategy, feePercent, commissionRate, ...rest } = parsed.data;

  let normalizedFeeRate: number | undefined;
  const rawFeeInput = feePercent ?? commissionRate ?? undefined;
  if (rawFeeInput !== undefined && rawFeeInput !== null) {
    try {
      normalizedFeeRate = normalizeFeeRate(rawFeeInput);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid fee percent. Use decimal (0.15) or percent points (15)."
        },
        { status: 400 }
      );
    }
  }

  const settings = await prisma.productSettings.upsert({
    where: { productId: params.id },
    update: {
      costPrice: parsed.data.costPrice,
      commissionRate: normalizedFeeRate,
      serviceFeeType: "PERCENT",
      serviceFeeValue: 0,
      // Product-level shipping/VAT/handling are ignored to enforce the global no-loss formula.
      shippingCost: undefined,
      handlingCost: undefined,
      vatRate: undefined,
      vatMode: undefined,
      minProfitType: rest.minProfitType,
      minProfitValue: rest.minProfitValue,
      undercutStep: rest.undercutStep,
      alertThresholdSar: rest.alertThresholdSar,
      alertThresholdPct: rest.alertThresholdPct,
      cooldownMinutes: rest.cooldownMinutes,
      competitorDropPct: rest.competitorDropPct,
      autoPilot: autoPilot ?? undefined,
      minPrice,
      strategy: strategy ?? undefined
    },
    create: {
      productId: params.id,
      costPrice: parsed.data.costPrice,
      commissionRate: normalizedFeeRate ?? 0,
      serviceFeeType: "PERCENT",
      serviceFeeValue: 0,
      autoPilot: autoPilot ?? false,
      minPrice,
      strategy: strategy ?? "MATCH",
      minProfitType: rest.minProfitType ?? undefined,
      minProfitValue: rest.minProfitValue ?? undefined,
      undercutStep: rest.undercutStep ?? undefined,
      alertThresholdSar: rest.alertThresholdSar ?? undefined,
      alertThresholdPct: rest.alertThresholdPct ?? undefined,
      cooldownMinutes: rest.cooldownMinutes ?? undefined,
      competitorDropPct: rest.competitorDropPct ?? undefined
    }
  });

  return NextResponse.json({ ok: true, settings: decorateSettingsWithFeePercent(settings as unknown as Record<string, unknown>) });
}

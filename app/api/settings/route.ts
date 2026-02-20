import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { formatApiError, isDatabaseUnavailableError } from "@/lib/db/errors";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { getOrCreateGlobalSettings } from "@/lib/pricing/effective-settings";
import { normalizeFeeRate } from "@/lib/pricing/calculator";

export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    feePercent: z.number().min(0).optional(),
    commissionRate: z.number().min(0).optional(),
    serviceFeeType: z.enum(["FIXED", "PERCENT"]).optional(),
    serviceFeeValue: z.number().min(0).optional(),
    shippingCost: z.number().min(0),
    handlingCost: z.number().min(0).optional(),
    vatRate: z.number().min(0).max(100).optional(),
    vatMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]).optional(),
    minProfitType: z.enum(["SAR", "PERCENT"]),
    minProfitValue: z.number().min(0),
    undercutStep: z.number().min(0),
    alertThresholdSar: z.number().min(0),
    alertThresholdPct: z.number().min(0),
    cooldownMinutes: z.number().int().min(1),
    competitorDropPct: z.number().min(0)
  })
  .superRefine((data, ctx) => {
    if (data.feePercent === undefined && data.commissionRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["feePercent"],
        message: "feePercent (or commissionRate) is required"
      });
    }
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

function toFeePercentValue(rate: unknown) {
  const value = Number(rate ?? 0);
  if (!Number.isFinite(value)) {
    return 0;
  }

  return value < 1 ? value * 100 : value;
}

function decorateSettingsWithFeePercent<T extends Record<string, unknown>>(settings: T) {
  return {
    ...settings,
    feePercent: toFeePercentValue(settings.commissionRate)
  };
}

function fallbackSettings() {
  return {
    currency: "SAR",
    commissionRate: 0.15,
    feePercent: 15,
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
    return NextResponse.json(
      { settings: decorateSettingsWithFeePercent(settings as unknown as Record<string, unknown>), integrations: integrationStatus() },
      { headers: NO_STORE_HEADERS }
    );
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

    const feeInput = parsed.data.feePercent ?? parsed.data.commissionRate ?? 0;
    let normalizedFeeRate: number;

    try {
      normalizedFeeRate = normalizeFeeRate(feeInput);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid fee percent. Use decimal (0.15) or percent points (15)."
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const current = await getOrCreateGlobalSettings();

    const settings = await prisma.globalSettings.update({
      where: { id: current.id },
      data: {
        commissionRate: normalizedFeeRate,
        serviceFeeType: "PERCENT",
        serviceFeeValue: 0,
        shippingCost: parsed.data.shippingCost,
        handlingCost: 0,
        vatRate: 15,
        vatMode: "INCLUSIVE",
        minProfitType: parsed.data.minProfitType,
        minProfitValue: parsed.data.minProfitValue,
        undercutStep: parsed.data.undercutStep,
        alertThresholdSar: parsed.data.alertThresholdSar,
        alertThresholdPct: parsed.data.alertThresholdPct,
        cooldownMinutes: parsed.data.cooldownMinutes,
        competitorDropPct: parsed.data.competitorDropPct
      }
    });

    return NextResponse.json(
      {
        ok: true,
        settings: decorateSettingsWithFeePercent(settings as unknown as Record<string, unknown>),
        integrations: integrationStatus()
      },
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

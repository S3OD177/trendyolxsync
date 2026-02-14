import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { breakEvenPrice, computeFees } from "@/lib/pricing/calculator";
import { getEffectiveSettingsForProduct } from "@/lib/pricing/effective-settings";
import { suggestedPrice } from "@/lib/pricing/suggested-price";
import { refreshSnapshotForProduct } from "@/lib/jobs/poll-products";
import { trendyolClient } from "@/lib/trendyol/client";

const bodySchema = z
  .object({
    productId: z.string().min(1),
    method: z.enum(["SUGGESTED", "CUSTOM"]),
    customPrice: z.number().positive().optional(),
    confirmLoss: z.boolean().optional().default(false)
  })
  .superRefine((data, ctx) => {
    if (data.method === "CUSTOM" && !data.customPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customPrice"],
        message: "customPrice is required for CUSTOM updates"
      });
    }
  });

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { productId, method, customPrice, confirmLoss } = parsed.data;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      snapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1
      },
      priceChanges: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const latestSnapshot = product.snapshots[0];
  const ourPrice =
    latestSnapshot?.ourPrice !== null && latestSnapshot?.ourPrice !== undefined
      ? Number(latestSnapshot.ourPrice)
      : null;
  const competitorMin =
    latestSnapshot?.competitorMinPrice !== null && latestSnapshot?.competitorMinPrice !== undefined
      ? Number(latestSnapshot.competitorMinPrice)
      : null;

  const settings = await getEffectiveSettingsForProduct(product.id);
  const breakEven = breakEvenPrice(settings);

  const computedSuggestion = suggestedPrice({
    competitorMin,
    ourPrice,
    settings,
    lastDownwardChangeAt: product.priceChanges[0]?.createdAt ?? null,
    bypassCooldown: true
  });

  const priceToApply = method === "CUSTOM" ? customPrice ?? null : computedSuggestion.suggested;

  if (!priceToApply) {
    return NextResponse.json({ error: "No valid price to apply" }, { status: 400 });
  }

  const feeResult = computeFees(priceToApply, settings);
  const lossRisk = priceToApply < breakEven || feeResult.profitSar < 0;

  if (lossRisk && !confirmLoss) {
    return NextResponse.json(
      {
        error: "Price may cause loss",
        requiresConfirm: true,
        breakEvenPrice: breakEven,
        projectedProfit: feeResult.profitSar
      },
      { status: 409 }
    );
  }

  if (!trendyolClient.isConfigured()) {
    return NextResponse.json({ error: "Trendyol credentials are not configured" }, { status: 400 });
  }

  const reference = product.barcode || product.sku;
  const response = await trendyolClient.updatePrice(reference, priceToApply);

  await prisma.priceChangeLog.create({
    data: {
      productId: product.id,
      oldPrice: ourPrice,
      newPrice: priceToApply,
      method,
      trendyolResponseJson: response.raw as Prisma.InputJsonValue
    }
  });

  const snapshot = await refreshSnapshotForProduct(product);

  return NextResponse.json({
    ok: true,
    appliedPrice: priceToApply,
    method,
    breakEvenPrice: breakEven,
    projectedProfit: feeResult.profitSar,
    snapshot
  });
}

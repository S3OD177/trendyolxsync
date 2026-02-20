import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { enforcedFloorPrice } from "@/lib/pricing/calculator";
import { getEffectiveSettingsForProduct } from "@/lib/pricing/effective-settings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: {
      snapshots: {
        orderBy: { checkedAt: "desc" },
        take: 100
      },
      alerts: {
        orderBy: { createdAt: "desc" },
        take: 50
      },
      settings: true
    }
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const effectiveSettings = await getEffectiveSettingsForProduct(product.id);
  const minPrice = product.settings?.minPrice ? Number(product.settings.minPrice) : 0;
  const breakEven = enforcedFloorPrice(effectiveSettings, minPrice);
  const feeRate = product.settings?.commissionRate !== null && product.settings?.commissionRate !== undefined
    ? Number(product.settings.commissionRate)
    : null;
  const feePercent = feeRate === null ? null : feeRate < 1 ? feeRate * 100 : feeRate;

  return NextResponse.json({
    product: {
      ...product,
      settings: product.settings
        ? {
            ...product.settings,
            feePercent
          }
        : null
    },
    effectiveSettings,
    breakEven,
    chart: product.snapshots.map((snapshot: (typeof product.snapshots)[number]) => ({
      checkedAt: snapshot.checkedAt,
      ourPrice: snapshot.ourPrice,
      competitorMinPrice: snapshot.competitorMinPrice
    }))
  });
}

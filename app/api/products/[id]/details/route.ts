import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { breakEvenPrice } from "@/lib/pricing/calculator";
import { getEffectiveSettingsForProduct } from "@/lib/pricing/effective-settings";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const breakEven = breakEvenPrice(effectiveSettings);

  return NextResponse.json({
    product,
    effectiveSettings,
    breakEven,
    chart: product.snapshots.map((snapshot) => ({
      checkedAt: snapshot.checkedAt,
      ourPrice: snapshot.ourPrice,
      competitorMinPrice: snapshot.competitorMinPrice
    }))
  });
}

import type { BuyBoxStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { breakEvenPrice, computeFees } from "@/lib/pricing/calculator";
import { getEffectiveSettingsForProduct } from "@/lib/pricing/effective-settings";
import { suggestedPrice } from "@/lib/pricing/suggested-price";

export interface DashboardRowDTO {
  productId: string;
  sku: string;
  barcode: string | null;
  title: string;
  listingId: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  ourPrice: number | null;
  competitorMinPrice: number | null;
  deltaSar: number | null;
  deltaPct: number | null;
  buyboxStatus: BuyBoxStatus;
  suggestedPrice: number | null;
  marginSar: number | null;
  marginPct: number | null;
  breakEvenPrice: number;
  lowMarginRisk: boolean;
  lastCheckedAt: string | null;
}

const toNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export async function buildDashboardRows() {
  let products = await prisma.product.findMany({
    where: { active: true },
    include: {
      snapshots: {
        orderBy: { checkedAt: "desc" },
        take: 1
      },
      priceChanges: {
        orderBy: { createdAt: "desc" },
        take: 20
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!products.length) {
    products = await prisma.product.findMany({
      include: {
        snapshots: {
          orderBy: { checkedAt: "desc" },
          take: 1
        },
        priceChanges: {
          orderBy: { createdAt: "desc" },
          take: 20
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  const rows: DashboardRowDTO[] = [];

  for (const product of products) {
    const latestSnapshot = product.snapshots[0];
    const settings = await getEffectiveSettingsForProduct(product.id);
    const breakEven = breakEvenPrice(settings);

    const lastDownwardChange =
      product.priceChanges.find((item) => item.oldPrice !== null && Number(item.newPrice) < Number(item.oldPrice)) ??
      null;

    const ourPrice = toNumber(latestSnapshot?.ourPrice);
    const competitorMinPrice = toNumber(latestSnapshot?.competitorMinPrice);

    const deltaSar =
      ourPrice !== null && competitorMinPrice !== null ? ourPrice - competitorMinPrice : null;
    const deltaPct =
      deltaSar !== null && ourPrice !== null && ourPrice > 0
        ? Number(((deltaSar / ourPrice) * 100).toFixed(2))
        : null;

    const pricing = ourPrice !== null ? computeFees(ourPrice, settings) : null;

    const suggestion = suggestedPrice({
      competitorMin: competitorMinPrice,
      ourPrice,
      settings,
      lastDownwardChangeAt: lastDownwardChange?.createdAt ?? null
    });

    rows.push({
      productId: product.id,
      sku: product.sku,
      barcode: product.barcode,
      title: product.title,
      listingId: product.trendyolProductId,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      ourPrice,
      competitorMinPrice,
      deltaSar,
      deltaPct,
      buyboxStatus: latestSnapshot?.buyboxStatus ?? "UNKNOWN",
      suggestedPrice: suggestion.suggested,
      marginSar: pricing?.profitSar ?? null,
      marginPct: pricing?.profitPct ?? null,
      breakEvenPrice: breakEven,
      lowMarginRisk: ourPrice !== null ? ourPrice <= breakEven * 1.03 : false,
      lastCheckedAt: latestSnapshot?.checkedAt?.toISOString() ?? null
    });
  }

  return rows;
}

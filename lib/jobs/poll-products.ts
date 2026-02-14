import { AlertSeverity, type PriceChangeMethod, type Product } from "@prisma/client";
import { detectAlerts } from "@/lib/alerts/detector";
import { notifyAllChannels } from "@/lib/alerts/notifier";
import { prisma } from "@/lib/db/prisma";
import { breakEvenPrice } from "@/lib/pricing/calculator";
import { getEffectiveSettingsForProduct, getOrCreateGlobalSettings } from "@/lib/pricing/effective-settings";
import { suggestedPrice } from "@/lib/pricing/suggested-price";
import { trendyolClient } from "@/lib/trendyol/client";

export interface PollRunSummary {
  ok: boolean;
  processed: number;
  alertsCreated: number;
  durationMs: number;
  skipped: number;
  message?: string;
}

async function lastDownwardChangeAt(productId: string) {
  const record = await prisma.priceChangeLog.findFirst({
    where: {
      productId,
      oldPrice: { not: null }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!record?.oldPrice) {
    return null;
  }

  if (Number(record.newPrice) < Number(record.oldPrice)) {
    return record.createdAt;
  }

  return null;
}

async function shouldCreateAlert(productId: string, type: string, dedupeMinutes = 15) {
  const since = new Date(Date.now() - dedupeMinutes * 60 * 1000);
  const recent = await prisma.alert.findFirst({
    where: {
      productId,
      type: type as any,
      createdAt: {
        gte: since
      }
    }
  });

  return !recent;
}

function inferBuyBoxStatus(
  ourPrice: number | null,
  competitorMinPrice: number | null,
  buyboxSellerId: string | null,
  sellerId: string | undefined
) {
  if (buyboxSellerId && sellerId && buyboxSellerId === sellerId) {
    return "WIN" as const;
  }

  if (ourPrice === null || competitorMinPrice === null) {
    return "UNKNOWN" as const;
  }

  return ourPrice <= competitorMinPrice ? ("WIN" as const) : ("LOSE" as const);
}

export async function refreshSnapshotForProduct(product: Product) {
  const [priceStock, competitor] = await Promise.all([
    trendyolClient.fetchPriceAndStock({
      sku: product.sku,
      barcode: product.barcode ?? undefined,
      productId: product.trendyolProductId ?? undefined
    }),
    trendyolClient.fetchCompetitorPrices({
      sku: product.sku,
      barcode: product.barcode ?? undefined,
      productId: product.trendyolProductId ?? undefined
    })
  ]);

  const buyboxStatus = inferBuyBoxStatus(
    priceStock.ourPrice,
    competitor.competitorMinPrice,
    competitor.buyboxSellerId,
    trendyolClient.getSellerId()
  );

  return prisma.priceSnapshot.create({
    data: {
      productId: product.id,
      ourPrice: priceStock.ourPrice,
      competitorMinPrice: competitor.competitorMinPrice,
      competitorCount: competitor.competitorCount,
      buyboxStatus,
      buyboxSellerId: competitor.buyboxSellerId,
      rawPayloadJson: {
        priceStock: priceStock.raw,
        competitor: competitor.raw
      }
    }
  });
}

export async function runPoll(): Promise<PollRunSummary> {
  const start = Date.now();

  if (!trendyolClient.isConfigured()) {
    return {
      ok: true,
      processed: 0,
      alertsCreated: 0,
      skipped: 0,
      durationMs: Date.now() - start,
      message: "Trendyol credentials are not configured"
    };
  }

  await getOrCreateGlobalSettings();

  const products = await prisma.product.findMany({ where: { active: true } });

  let alertsCreated = 0;
  let skipped = 0;

  for (const product of products) {
    try {
      const [previousSnapshot, lastDecreaseAt, effectiveSettings] = await Promise.all([
        prisma.priceSnapshot.findFirst({
          where: { productId: product.id },
          orderBy: { checkedAt: "desc" }
        }),
        lastDownwardChangeAt(product.id),
        getEffectiveSettingsForProduct(product.id)
      ]);

      const snapshot = await refreshSnapshotForProduct(product);

      const ourPrice = snapshot.ourPrice !== null ? Number(snapshot.ourPrice) : null;
      const competitorMin =
        snapshot.competitorMinPrice !== null ? Number(snapshot.competitorMinPrice) : null;

      const suggestion = suggestedPrice({
        competitorMin,
        ourPrice,
        settings: effectiveSettings,
        lastDownwardChangeAt: lastDecreaseAt
      });

      const breakEven = breakEvenPrice(effectiveSettings);

      const alertCandidates = detectAlerts({
        productId: product.id,
        sku: product.sku,
        ourPrice,
        competitorMin,
        previousCompetitorMin:
          previousSnapshot?.competitorMinPrice !== null && previousSnapshot?.competitorMinPrice !== undefined
            ? Number(previousSnapshot.competitorMinPrice)
            : null,
        buyboxStatus: snapshot.buyboxStatus,
        breakEvenPrice: breakEven,
        suggestedPrice: suggestion.suggested,
        settings: effectiveSettings
      });

      for (const candidate of alertCandidates) {
        const shouldCreate = await shouldCreateAlert(product.id, candidate.type, 15);
        if (!shouldCreate) {
          continue;
        }

        await prisma.alert.create({
          data: {
            productId: product.id,
            type: candidate.type,
            severity: candidate.severity,
            message: candidate.message,
            metadataJson: candidate.metadata
          }
        });
        alertsCreated += 1;

        const severityTag = candidate.severity === AlertSeverity.CRITICAL ? "CRITICAL" : "ALERT";

        await notifyAllChannels({
          title: `[${severityTag}] ${candidate.type} - ${product.sku}`,
          body: `${candidate.message}\nOur price: ${ourPrice ?? "n/a"} SAR\nCompetitor min: ${competitorMin ?? "n/a"} SAR\nSuggested: ${suggestion.suggested ?? "n/a"} SAR`
        });
      }
    } catch {
      skipped += 1;
    }
  }

  return {
    ok: true,
    processed: products.length - skipped,
    alertsCreated,
    skipped,
    durationMs: Date.now() - start
  };
}

export async function getLastPriceChangeMethod(productId: string): Promise<PriceChangeMethod | null> {
  const last = await prisma.priceChangeLog.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" }
  });

  return last?.method ?? null;
}

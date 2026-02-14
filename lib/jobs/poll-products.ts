import {
  AlertSeverity,
  type GlobalSettings,
  type MinProfitType,
  type PriceChangeMethod,
  type Product,
  type ProductSettings,
  type ServiceFeeType,
  type VatMode
} from "@prisma/client";
import { detectAlerts } from "@/lib/alerts/detector";
import { notifyAllChannels } from "@/lib/alerts/notifier";
import { prisma } from "@/lib/db/prisma";
import { breakEvenPrice, computeFees } from "@/lib/pricing/calculator";
import { suggestedPrice } from "@/lib/pricing/suggested-price";
import type { EffectiveProductSettings } from "@/lib/pricing/types";
import { trendyolClient } from "@/lib/trendyol/client";

export interface PollRunSummary {
  ok: boolean;
  processed: number;
  alertsCreated: number;
  durationMs: number;
  skipped: number;
  message?: string;
}

const decimalToNumber = (value: unknown, fallback = 0) =>
  value === null || value === undefined ? fallback : Number(value);

function mergeSettings(globalSettings: GlobalSettings, productSettings: ProductSettings): EffectiveProductSettings {
  return {
    costPrice: decimalToNumber(productSettings.costPrice),
    commissionRate: decimalToNumber(productSettings.commissionRate, decimalToNumber(globalSettings.commissionRate)),
    serviceFeeType:
      (productSettings.serviceFeeType as ServiceFeeType | null) ?? globalSettings.serviceFeeType,
    serviceFeeValue: decimalToNumber(productSettings.serviceFeeValue, decimalToNumber(globalSettings.serviceFeeValue)),
    shippingCost: decimalToNumber(productSettings.shippingCost, decimalToNumber(globalSettings.shippingCost)),
    handlingCost: decimalToNumber(productSettings.handlingCost, decimalToNumber(globalSettings.handlingCost)),
    vatRate: decimalToNumber(productSettings.vatRate, decimalToNumber(globalSettings.vatRate)),
    vatMode: (productSettings.vatMode as VatMode | null) ?? globalSettings.vatMode,
    minProfitType:
      (productSettings.minProfitType as MinProfitType | null) ?? globalSettings.minProfitType,
    minProfitValue: decimalToNumber(productSettings.minProfitValue, decimalToNumber(globalSettings.minProfitValue)),
    undercutStep: decimalToNumber(productSettings.undercutStep, decimalToNumber(globalSettings.undercutStep)),
    alertThresholdSar: decimalToNumber(
      productSettings.alertThresholdSar,
      decimalToNumber(globalSettings.alertThresholdSar)
    ),
    alertThresholdPct: decimalToNumber(
      productSettings.alertThresholdPct,
      decimalToNumber(globalSettings.alertThresholdPct)
    ),
    cooldownMinutes: productSettings.cooldownMinutes ?? globalSettings.cooldownMinutes,
    competitorDropPct: decimalToNumber(
      productSettings.competitorDropPct,
      decimalToNumber(globalSettings.competitorDropPct)
    )
  };
}

async function getOrCreateGlobalSettings() {
  const existing = await prisma.globalSettings.findFirst();
  if (existing) {
    return existing;
  }

  return prisma.globalSettings.create({
    data: {
      currency: "SAR"
    }
  });
}

async function getOrCreateProductSettings(productId: string) {
  const settings = await prisma.productSettings.findUnique({ where: { productId } });
  if (settings) {
    return settings;
  }

  return prisma.productSettings.create({
    data: {
      productId,
      costPrice: 0
    }
  });
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

async function shouldCreateAlert(productId: string, type: any, dedupeMinutes = 15) {
  const since = new Date(Date.now() - dedupeMinutes * 60 * 1000);
  const recent = await prisma.alert.findFirst({
    where: {
      productId,
      type,
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
  supplierId: string | undefined
) {
  if (buyboxSellerId && supplierId && buyboxSellerId === supplierId) {
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
    process.env.TRENDYOL_SUPPLIER_ID
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

  const [globalSettings, products] = await Promise.all([
    getOrCreateGlobalSettings(),
    prisma.product.findMany({ where: { active: true } })
  ]);

  let alertsCreated = 0;
  let skipped = 0;

  for (const product of products) {
    try {
      const [productSettings, previousSnapshot, lastDecreaseAt] = await Promise.all([
        getOrCreateProductSettings(product.id),
        prisma.priceSnapshot.findFirst({
          where: { productId: product.id },
          orderBy: { checkedAt: "desc" }
        }),
        lastDownwardChangeAt(product.id)
      ]);

      const effectiveSettings = mergeSettings(globalSettings, productSettings);
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

      if (ourPrice !== null) {
        computeFees(ourPrice, effectiveSettings);
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

export async function getEffectiveSettingsForProduct(productId: string): Promise<EffectiveProductSettings> {
  const globalSettings = await getOrCreateGlobalSettings();
  const productSettings = await getOrCreateProductSettings(productId);
  return mergeSettings(globalSettings, productSettings);
}

export async function getLastPriceChangeMethod(productId: string): Promise<PriceChangeMethod | null> {
  const last = await prisma.priceChangeLog.findFirst({
    where: { productId },
    orderBy: { createdAt: "desc" }
  });

  return last?.method ?? null;
}

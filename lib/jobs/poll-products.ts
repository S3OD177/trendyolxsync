import type { Prisma, PriceChangeMethod, Product } from "@prisma/client";
import { detectAlerts } from "@/lib/alerts/detector";
import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { breakEvenPrice } from "@/lib/pricing/calculator";
import { getEffectiveSettingsForProduct, getOrCreateGlobalSettings } from "@/lib/pricing/effective-settings";
import { suggestedPrice } from "@/lib/pricing/suggested-price";
import { trendyolClient } from "@/lib/trendyol/client";
import { syncCatalogFromTrendyol } from "@/lib/trendyol/sync-catalog";
import type { TrendyolProductItem } from "@/lib/trendyol/types";

export interface PollRunSummary {
  ok: boolean;
  processed: number;
  alertsCreated: number;
  durationMs: number;
  skipped: number;
  catalogSynced: number;
  catalogPagesFetched: number;
  catalogSyncError?: string;
  errors?: Array<{ sku: string; message: string }>;
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
  sellerId: string | undefined,
  competitorCount: number | null
) {
  if (buyboxSellerId && sellerId && buyboxSellerId === sellerId) {
    return "WIN" as const;
  }

  // If we have a price, but no competitors found (count === 0), it implies we are the only seller.
  // We treat this as a WIN because we own the BuyBox (or the only listing).
  if (ourPrice !== null && competitorCount === 0) {
    return "WIN" as const;
  }

  if (ourPrice === null || competitorMinPrice === null) {
    return "UNKNOWN" as const;
  }

  return ourPrice <= competitorMinPrice ? ("WIN" as const) : ("LOSE" as const);
}

function buildCatalogLookup(items: TrendyolProductItem[]) {
  const map = new Map<string, TrendyolProductItem>();

  for (const item of items) {
    map.set(item.sku, item);
    if (item.barcode) {
      map.set(item.barcode, item);
    }
    if (item.productId) {
      map.set(item.productId, item);
    }
  }

  return map;
}

export async function refreshSnapshotForProduct(
  product: Product,
  catalogItem?: TrendyolProductItem
) {
  const [priceStock, competitor] = await Promise.all([
    catalogItem
      ? Promise.resolve({
        ourPrice: catalogItem.ourPrice ?? null,
        stock: catalogItem.stock ?? null,
        raw: {
          source: "catalog_cache",
          item: catalogItem.raw ?? catalogItem
        }
      })
      : trendyolClient.fetchPriceAndStock({
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
    trendyolClient.getSellerId(),
    competitor.competitorCount
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
      } as Prisma.InputJsonValue
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
      catalogSynced: 0,
      catalogPagesFetched: 0,
      durationMs: Date.now() - start,
      message: "Trendyol credentials are not configured"
    };
  }

  await getOrCreateGlobalSettings();

  let catalogSynced = 0;
  let catalogPagesFetched = 0;
  let catalogSyncError: string | undefined;
  let catalogLookup = new Map<string, TrendyolProductItem>();

  if (env.AUTO_SYNC_CATALOG) {
    try {
      const syncSummary = await syncCatalogFromTrendyol({
        maxPages: env.AUTO_SYNC_MAX_PAGES,
        pageSize: env.AUTO_SYNC_PAGE_SIZE,
        hydratePrices: false,
        hydrateLimit: 0,
        createInitialSnapshots: false,
        includeItems: true
      });
      catalogSynced = syncSummary.totalSynced;
      catalogPagesFetched = syncSummary.pagesFetched;
      if (syncSummary.items?.length) {
        catalogLookup = buildCatalogLookup(syncSummary.items);
      }
    } catch (error) {
      catalogSyncError =
        error instanceof Error ? error.message : "Automatic catalog sync failed";
    }
  }

  const products = await prisma.product.findMany({ where: { active: true } });

  if (!products.length) {
    return {
      ok: true,
      processed: 0,
      alertsCreated: 0,
      skipped: 0,
      catalogSynced,
      catalogPagesFetched,
      catalogSyncError,
      durationMs: Date.now() - start,
      message: catalogSyncError
        ? "No active products and catalog sync failed"
        : "No active products found after catalog sync"
    };
  }

  let alertsCreated = 0;
  let skipped = 0;
  const errors: Array<{ sku: string; message: string }> = [];

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

      const catalogMatch =
        catalogLookup.get(product.sku) ??
        (product.barcode ? catalogLookup.get(product.barcode) : undefined) ??
        (product.trendyolProductId ? catalogLookup.get(product.trendyolProductId) : undefined);

      const snapshot = await refreshSnapshotForProduct(product, catalogMatch);

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
            metadataJson: candidate.metadata as Prisma.InputJsonValue
          }
        });
        alertsCreated += 1;
      }
    } catch (error) {
      skipped += 1;
      if (errors.length < 20) {
        errors.push({
          sku: product.sku,
          message: error instanceof Error ? error.message : "Unknown poll error"
        });
      }
    }
  }

  return {
    ok: true,
    processed: products.length - skipped,
    alertsCreated,
    skipped,
    catalogSynced,
    catalogPagesFetched,
    catalogSyncError,
    errors: errors.length ? errors : undefined,
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

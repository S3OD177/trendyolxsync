import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { trendyolClient } from "@/lib/trendyol/client";
import type { TrendyolProductItem } from "@/lib/trendyol/types";

export interface CatalogSyncOptions {
  maxPages?: number;
  pageSize?: number;
  hydratePrices?: boolean;
  hydrateLimit?: number;
  createInitialSnapshots?: boolean;
  includeItems?: boolean;
}

export interface CatalogSyncSummary {
  totalSynced: number;
  pagesFetched: number;
  hydrationAttempts: number;
  hydratedSnapshots: number;
  hydrationErrors: number;
  dbTotalProducts: number;
  dbActiveProducts: number;
  items?: TrendyolProductItem[];
}

export async function syncCatalogFromTrendyol(
  options: CatalogSyncOptions = {}
): Promise<CatalogSyncSummary> {
  if (!trendyolClient.isConfigured()) {
    throw new Error("Trendyol credentials are not configured");
  }

  const maxPages = options.maxPages ?? 5;
  const pageSize = options.pageSize ?? 50;
  const hydratePrices = options.hydratePrices ?? true;
  const hydrateLimit = options.hydrateLimit ?? 150;
  const createInitialSnapshots = options.createInitialSnapshots ?? true;
  const includeItems = options.includeItems ?? false;
  const itemsBySku = includeItems ? new Map<string, TrendyolProductItem>() : null;

  let page = 0;
  let totalSynced = 0;
  let pagesFetched = 0;
  let hydrationAttempts = 0;
  let hydratedSnapshots = 0;
  let hydrationErrors = 0;

  while (page < maxPages) {
    const result = await trendyolClient.fetchProducts(page, pageSize);
    pagesFetched += 1;

    if (!result.items.length) {
      break;
    }

    for (const item of result.items) {
      if (itemsBySku) {
        itemsBySku.set(item.sku, item);
      }

      const savedProduct = await prisma.product.upsert({
        where: { sku: item.sku },
        update: {
          barcode: item.barcode,
          title: item.title,
          trendyolProductId: item.productId,
          category: item.category,
          active: item.active,
          currency: "SAR"
        },
        create: {
          sku: item.sku,
          barcode: item.barcode,
          title: item.title,
          trendyolProductId: item.productId,
          category: item.category,
          active: item.active,
          currency: "SAR",
          settings: {
            create: {
              costPrice: 0
            }
          }
        }
      });

      if (createInitialSnapshots) {
        let snapshotPrice = item.ourPrice ?? null;
        let snapshotRaw: unknown = {
          source: "catalog_sync",
          item: item.raw ?? item
        };

        const needsHydration = snapshotPrice === null && hydratePrices && hydrationAttempts < hydrateLimit;

        if (needsHydration) {
          hydrationAttempts += 1;

          try {
            const live = await trendyolClient.fetchPriceAndStock({
              sku: savedProduct.sku,
              barcode: savedProduct.barcode ?? undefined,
              productId: savedProduct.trendyolProductId ?? undefined
            });

            snapshotPrice = live.ourPrice ?? snapshotPrice;
            snapshotRaw = {
              source: "catalog_sync_with_live_lookup",
              catalog: item.raw ?? item,
              live: live.raw
            };

            if (snapshotPrice !== null) {
              hydratedSnapshots += 1;
            }
          } catch {
            hydrationErrors += 1;
          }
        }

        if (snapshotPrice !== null) {
          let competitorMinPrice: number | null = null;
          let competitorCount: number | null = null;
          let buyboxStatus: "WIN" | "LOSE" | "UNKNOWN" = "UNKNOWN";
          let buyboxSellerId: string | null = null;

          try {
            const competitor = await trendyolClient.fetchCompetitorPrices({
              sku: savedProduct.sku,
              barcode: savedProduct.barcode ?? undefined,
              productId: savedProduct.trendyolProductId ?? undefined
            });
            competitorMinPrice = competitor.competitorMinPrice;
            competitorCount = competitor.competitorCount;
            buyboxSellerId = competitor.buyboxSellerId;
            buyboxStatus = competitor.buyboxStatus;
          } catch {
            // Best-effort buybox fetch during sync
          }

          await prisma.priceSnapshot.create({
            data: {
              productId: savedProduct.id,
              ourPrice: snapshotPrice,
              competitorMinPrice,
              competitorCount,
              buyboxStatus,
              buyboxSellerId,
              rawPayloadJson: snapshotRaw as Prisma.InputJsonValue
            }
          });
        }
      }

      totalSynced += 1;
    }

    page += 1;

    if (result.totalPages !== undefined && page >= result.totalPages) {
      break;
    }
  }

  const [dbTotalProducts, dbActiveProducts] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { active: true } })
  ]);

  return {
    totalSynced,
    pagesFetched,
    hydrationAttempts,
    hydratedSnapshots,
    hydrationErrors,
    dbTotalProducts,
    dbActiveProducts,
    items: itemsBySku ? Array.from(itemsBySku.values()) : undefined
  };
}

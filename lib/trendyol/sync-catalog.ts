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

    const barcodes = result.items
      .map((i) => i.barcode)
      .filter((b): b is string => typeof b === "string" && b.length > 0);

    let buyboxMap = new Map<string, any>();
    if (barcodes.length > 0) {
      // Chunk into groups of 10 (Trendyol limit)
      const chunkSize = 10;
      for (let i = 0; i < barcodes.length; i += chunkSize) {
        const chunk = barcodes.slice(i, i + chunkSize);
        try {
          const { entries } = await trendyolClient.fetchBuyboxInformation(chunk);
          for (const entry of entries) {
            if (typeof entry?.barcode === 'string') {
              buyboxMap.set(entry.barcode, trendyolClient.parseBuyboxEntry(entry));
            } else if (typeof entry?.stockCode === 'string') {
              buyboxMap.set(entry.stockCode, trendyolClient.parseBuyboxEntry(entry));
            }
          }
          // Small sleep to be gentle
          await new Promise(r => setTimeout(r, 100));
        } catch (error) {
          console.warn(`Failed to batch fetch buybox info for chunk ${i}-${i + chunkSize}:`, error);
        }
      }
    }

    for (const item of result.items) {
      if ((item.stock ?? 0) <= 0) {
        continue;
      }

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
        // Use the price/stock directly from the "approved" list item.
        // This avoids N+1 calls to fetchPriceAndStock.
        const snapshotPrice = item.ourPrice ?? null;

        // We only create a snapshot if we have a price OR if we want to record "no price" state.
        // Assuming we want to track it even if null (to show as disabled/out of stock).

        let competitorMinPrice: number | null = null;
        let competitorCount: number | null = null;
        let buyboxStatus: "WIN" | "LOSE" | "UNKNOWN" = "UNKNOWN";
        let buyboxSellerId: string | null = null;
        let competitorRaw: any = null;

        if (item.barcode && buyboxMap.has(item.barcode)) {
          const entry = buyboxMap.get(item.barcode);
          competitorMinPrice = entry.competitorMinPrice;
          competitorCount = entry.competitorCount;
          buyboxStatus = entry.buyboxStatus;
          buyboxSellerId = entry.buyboxSellerId;
          competitorRaw = entry.raw;
        } else if (item.sku && buyboxMap.has(item.sku)) {
          const entry = buyboxMap.get(item.sku);
          competitorMinPrice = entry.competitorMinPrice;
          competitorCount = entry.competitorCount;
          buyboxStatus = entry.buyboxStatus;
          buyboxSellerId = entry.buyboxSellerId;
          competitorRaw = entry.raw;
        }

        // Only create snapshot if we have data to record (price or buybox)
        if (snapshotPrice !== null || buyboxStatus !== "UNKNOWN") {
          await prisma.priceSnapshot.create({
            data: {
              productId: savedProduct.id,
              ourPrice: snapshotPrice,
              competitorMinPrice,
              competitorCount,
              buyboxStatus,
              buyboxSellerId,
              rawPayloadJson: {
                source: "catalog_sync_batched",
                catalog: item.raw ?? item,
                competitor: competitorRaw
              } as Prisma.InputJsonValue
            }
          });
          hydratedSnapshots += 1;
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

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { trendyolClient } from "@/lib/trendyol/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  maxPages: z.number().int().min(1).max(50).default(5),
  pageSize: z.number().int().min(1).max(200).default(50),
  hydratePrices: z.boolean().default(true),
  hydrateLimit: z.number().int().min(0).max(500).default(150)
});

export async function POST(request: NextRequest) {
  try {
    if (!trendyolClient.isConfigured()) {
      return NextResponse.json(
        { error: "Trendyol credentials are not configured" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const payload = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const { maxPages, pageSize, hydratePrices, hydrateLimit } = parsed.data;

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
        const savedProduct = await prisma.product.upsert({
          where: { sku: item.sku },
          update: {
            barcode: item.barcode,
            title: item.title,
            trendyolProductId: item.productId,
            category: item.category,
            active: true,
            currency: "SAR"
          },
          create: {
            sku: item.sku,
            barcode: item.barcode,
            title: item.title,
            trendyolProductId: item.productId,
            category: item.category,
            active: true,
            currency: "SAR",
            settings: {
              create: {
                costPrice: 0
              }
            }
          }
        });

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
          await prisma.priceSnapshot.create({
            data: {
              productId: savedProduct.id,
              ourPrice: snapshotPrice,
              competitorMinPrice: null,
              competitorCount: null,
              buyboxStatus: "UNKNOWN",
              rawPayloadJson: snapshotRaw as Prisma.InputJsonValue
            }
          });
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

    return NextResponse.json(
      {
        ok: true,
        totalSynced,
        pagesFetched,
        hydrationAttempts,
        hydratedSnapshots,
        hydrationErrors,
        dbTotalProducts,
        dbActiveProducts,
        sellerId: trendyolClient.getSellerId(),
        storeFrontCode: trendyolClient.getStoreFrontCode()
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed unexpectedly",
        sellerId: trendyolClient.getSellerId(),
        storeFrontCode: trendyolClient.getStoreFrontCode()
      },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { trendyolClient } from "@/lib/trendyol/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  maxPages: z.number().int().min(1).max(50).default(5),
  pageSize: z.number().int().min(1).max(200).default(50)
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

    const { maxPages, pageSize } = parsed.data;

    let page = 0;
    let totalSynced = 0;
    let pagesFetched = 0;

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

        if (item.ourPrice !== null && item.ourPrice !== undefined) {
          await prisma.priceSnapshot.create({
            data: {
              productId: savedProduct.id,
              ourPrice: item.ourPrice,
              competitorMinPrice: null,
              competitorCount: null,
              buyboxStatus: "UNKNOWN",
              rawPayloadJson: {
                source: "catalog_sync",
                item: item.raw ?? item
              } as Prisma.InputJsonValue
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { trendyolClient } from "@/lib/trendyol/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  maxPages: z.number().int().min(1).max(50).default(5),
  pageSize: z.number().int().min(1).max(200).default(50)
});

export async function POST(request: NextRequest) {
  try {
    if (!trendyolClient.isConfigured()) {
      return NextResponse.json({ error: "Trendyol credentials are not configured" }, { status: 400 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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
        await prisma.product.upsert({
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
        totalSynced += 1;
      }

      page += 1;

      if (result.totalPages !== undefined && page >= result.totalPages) {
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      totalSynced,
      pagesFetched,
      sellerId: trendyolClient.getSellerId(),
      storeFrontCode: trendyolClient.getStoreFrontCode()
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sync failed unexpectedly",
        sellerId: trendyolClient.getSellerId(),
        storeFrontCode: trendyolClient.getStoreFrontCode()
      },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { trendyolClient } from "@/lib/trendyol/client";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const barcode = request.nextUrl.searchParams.get("barcode");

  if (!barcode) {
    const product = await prisma.product.findFirst({
      where: { barcode: { not: null }, active: true },
      select: { sku: true, barcode: true, title: true, trendyolProductId: true }
    });

    if (!product?.barcode) {
      return NextResponse.json({ error: "No products with barcodes found" }, { status: 404 });
    }

    return NextResponse.json({
      hint: `Use ?barcode=${product.barcode} to test`,
      sampleProduct: product
    });
  }

  try {
    const sellerId = trendyolClient.getSellerId();
    const storeFrontCode = trendyolClient.getStoreFrontCode();

    // Step 1: Fetch raw product data from the approved products endpoint
    // This shows us ALL fields Trendyol returns for this product
    const productData = await trendyolClient.fetchPriceAndStock({
      barcode,
      sku: barcode
    });

    // Step 2: Raw buybox API call
    const buyboxResult = await trendyolClient.fetchBuyboxInformation([barcode]);

    // Step 3: Full competitor price fetch (includes parsing)
    const competitorResult = await trendyolClient.fetchCompetitorPrices({
      barcode,
      sku: barcode
    });

    // Step 4: Check latest snapshot from DB for this product
    const dbProduct = await prisma.product.findFirst({
      where: { barcode },
      include: {
        snapshots: {
          orderBy: { checkedAt: "desc" },
          take: 1
        }
      }
    });

    return NextResponse.json({
      config: {
        sellerId,
        sellerIdType: typeof sellerId,
        storeFrontCode,
        isConfigured: trendyolClient.isConfigured()
      },
      productRaw: productData.raw,
      buyboxRaw: buyboxResult.raw,
      buyboxEntries: buyboxResult.entries,
      buyboxEntriesCount: buyboxResult.entries.length,
      competitorResult: {
        competitorMinPrice: competitorResult.competitorMinPrice,
        competitorCount: competitorResult.competitorCount,
        buyboxSellerId: competitorResult.buyboxSellerId,
        buyboxStatus: competitorResult.buyboxStatus,
        raw: competitorResult.raw
      },
      lastSnapshot: dbProduct?.snapshots?.[0] ?? null
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

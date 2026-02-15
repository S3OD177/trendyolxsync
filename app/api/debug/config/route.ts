import { NextResponse } from "next/server";
import { trendyolClient } from "@/lib/trendyol/client";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const sellerId = trendyolClient.getSellerId();
  const storeFrontCode = trendyolClient.getStoreFrontCode();

  // Find a sample barcode from the DB
  const product = await prisma.product.findFirst({
    where: { barcode: { not: null }, active: true },
    select: { barcode: true, sku: true }
  });

  return NextResponse.json({
    sellerId,
    storeFrontCode,
    baseUrl: trendyolClient.getBaseUrl(),
    isConfigured: trendyolClient.isConfigured(),
    sampleBarcode: product?.barcode ?? "",
    sampleSku: product?.sku ?? ""
  });
}

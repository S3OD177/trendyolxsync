import { NextResponse } from "next/server";
import { trendyolClient } from "@/lib/trendyol/client";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const sellerId = trendyolClient.getSellerId();
  const storeFrontCode = trendyolClient.getStoreFrontCode();

  let product: { barcode: string | null; sku: string } | null = null;
  let warning: string | null = null;

  try {
    product = await prisma.product.findFirst({
      where: { barcode: { not: null }, active: true },
      select: { barcode: true, sku: true }
    });
  } catch (error) {
    warning = error instanceof Error ? error.message : "Failed to load sample barcode from database";
  }

  return NextResponse.json({
    sellerId,
    storeFrontCode,
    baseUrl: trendyolClient.getBaseUrl(),
    isConfigured: trendyolClient.isConfigured(),
    sampleBarcode: product?.barcode ?? "",
    sampleSku: product?.sku ?? "",
    warning
  });
}

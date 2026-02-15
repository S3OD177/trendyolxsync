import { NextResponse } from "next/server";
import { trendyolClient } from "@/lib/trendyol/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface EndpointTest {
  name: string;
  method: string;
  path: string;
  body?: unknown;
  status: "ok" | "error" | "skipped";
  httpStatus?: number;
  responseKeys?: string[];
  dataCount?: number;
  sampleData?: unknown;
  error?: string;
  durationMs: number;
}

async function testEndpoint(
  name: string,
  path: string,
  init?: RequestInit
): Promise<EndpointTest> {
  const method = init?.method ?? "GET";
  const start = Date.now();

  try {
    const result = await trendyolClient.testEndpoint(path, init);
    const body = result.body as any;
    const keys = body && typeof body === "object" && !Array.isArray(body)
      ? Object.keys(body)
      : undefined;

    // Try to find data count
    let dataCount: number | undefined;
    if (Array.isArray(body)) {
      dataCount = body.length;
    } else if (body?.content && Array.isArray(body.content)) {
      dataCount = body.content.length;
    } else if (body?.items && Array.isArray(body.items)) {
      dataCount = body.items.length;
    } else if (body?.buyboxInfo && Array.isArray(body.buyboxInfo)) {
      dataCount = body.buyboxInfo.length;
    }

    // Get a small sample of the data
    let sampleData: unknown;
    const dataArray = Array.isArray(body)
      ? body
      : body?.content ?? body?.items ?? body?.buyboxInfo ?? null;
    if (Array.isArray(dataArray) && dataArray.length > 0) {
      // Show first item keys + values (trimmed)
      const first = dataArray[0];
      if (typeof first === "object" && first !== null) {
        sampleData = { _firstItemKeys: Object.keys(first), _firstItem: first };
      } else {
        sampleData = first;
      }
    } else if (keys && !dataArray) {
      // No array data, show the response shape
      sampleData = body;
    }

    return {
      name,
      method,
      path,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      status: result.status >= 200 && result.status < 300 ? "ok" : "error",
      httpStatus: result.status,
      responseKeys: keys,
      dataCount,
      sampleData,
      durationMs: Date.now() - start
    };
  } catch (error) {
    return {
      name,
      method,
      path,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      status: "error",
      error: error instanceof Error ? error.message : "unknown",
      durationMs: Date.now() - start
    };
  }
}

export async function GET() {
  const sellerId = trendyolClient.getSellerId();

  if (!trendyolClient.isConfigured()) {
    return NextResponse.json({ error: "Trendyol not configured" }, { status: 500 });
  }

  // First, get a barcode from products for testing
  let testBarcode: string | null = null;
  let testStockCode: string | null = null;

  const results: EndpointTest[] = [];

  // ===== 1. PRODUCT ENDPOINTS =====

  // 1a. Approved products
  const approved = await testEndpoint(
    "Products (approved)",
    `/integration/product/sellers/${sellerId}/products/approved?page=0&size=5&supplierId=${sellerId}`
  );
  results.push(approved);

  // Extract barcode from first product
  if (approved.status === "ok" && approved.sampleData) {
    const first = (approved.sampleData as any)?._firstItem;
    testBarcode = first?.barcode ?? null;
    testStockCode = first?.stockCode ?? null;
  }

  // 1b. All products (legacy)
  results.push(await testEndpoint(
    "Products (legacy/all)",
    `/integration/product/sellers/${sellerId}/products?page=0&size=5&supplierId=${sellerId}`
  ));

  // 1c. Products filtered by barcode
  if (testBarcode) {
    results.push(await testEndpoint(
      "Product by barcode",
      `/integration/product/sellers/${sellerId}/products/approved?page=0&size=5&supplierId=${sellerId}&barcode=${encodeURIComponent(testBarcode)}`
    ));
  }

  // ===== 2. BUYBOX ENDPOINT =====

  if (testBarcode) {
    results.push(await testEndpoint(
      "Buybox Information",
      `/integration/product/sellers/${sellerId}/products/buybox-information`,
      {
        method: "POST",
        body: JSON.stringify({
          barcodes: [testBarcode],
          supplierId: Number(sellerId)
        })
      }
    ));
  }

  // ===== 3. PRICE & INVENTORY =====

  // 3a. Test reading (not writing) price/inventory — just check endpoint exists
  results.push(await testEndpoint(
    "Price & Inventory (read test, empty items)",
    `/integration/inventory/sellers/${sellerId}/products/price-and-inventory`,
    {
      method: "POST",
      body: JSON.stringify({ items: [] })
    }
  ));

  // ===== 4. CATEGORIES =====

  results.push(await testEndpoint(
    "Category Tree",
    `/integration/product/product-categories`
  ));

  // ===== 5. BRANDS =====

  results.push(await testEndpoint(
    "Brands (first page)",
    `/integration/product/brands?page=0&size=5`
  ));

  // ===== 6. ORDERS / SHIPMENTS =====

  results.push(await testEndpoint(
    "Shipment Packages",
    `/integration/order/sellers/${sellerId}/shipment-packages?page=0&size=5`
  ));

  // ===== 7. RETURNS / CLAIMS =====

  results.push(await testEndpoint(
    "Claims/Returns",
    `/integration/order/sellers/${sellerId}/claims?page=0&size=5`
  ));

  // ===== 8. SELLER INFO / ADDRESSES =====

  results.push(await testEndpoint(
    "Supplier Addresses",
    `/integration/sellers/${sellerId}/addresses`
  ));

  results.push(await testEndpoint(
    "Supplier Addresses (alt path)",
    `/integration/product/sellers/${sellerId}/addresses`
  ));

  // ===== 9. BATCH REQUEST (test with dummy ID) =====

  results.push(await testEndpoint(
    "Batch Request Result (dummy)",
    `/integration/product/sellers/${sellerId}/products/batch-requests/00000000-0000-0000-0000-000000000000`
  ));

  // ===== 10. CARGO COMPANIES =====

  results.push(await testEndpoint(
    "Cargo Companies",
    `/integration/order/cargo-companies`
  ));

  // ===== 11. WEBHOOK =====

  results.push(await testEndpoint(
    "Webhooks",
    `/integration/webhook/sellers/${sellerId}`
  ));

  // ===== SUMMARY =====

  const summary = {
    totalTested: results.length,
    working: results.filter(r => r.status === "ok").length,
    failed: results.filter(r => r.status === "error").length,
    config: {
      sellerId,
      storeFrontCode: trendyolClient.getStoreFrontCode(),
      baseUrl: trendyolClient.getBaseUrl(),
      testBarcode,
      testStockCode
    }
  };

  return NextResponse.json({ summary, results });
}

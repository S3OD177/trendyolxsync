import { env } from "@/lib/config/env";
import type {
  TrendyolClientOptions,
  TrendyolCompetitorData,
  TrendyolPriceStock,
  TrendyolPriceUpdateResponse,
  TrendyolProductItem
} from "@/lib/trendyol/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestAt = 0;

export class TrendyolClient {
  private sellerId: string;
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private apiToken?: string;
  private userAgent: string;
  private storeFrontCode?: string;

  constructor(options?: TrendyolClientOptions) {
    const seller = options?.supplierId ?? env.TRENDYOL_SUPPLIER_ID ?? env.TRENDYOL_SELLER_ID ?? "";

    this.sellerId = seller;
    this.baseUrl = options?.baseUrl ?? env.TRENDYOL_BASE_URL;
    this.apiKey = options?.apiKey ?? env.TRENDYOL_API_KEY ?? "";
    this.apiSecret = options?.apiSecret ?? env.TRENDYOL_API_SECRET ?? "";
    this.apiToken = env.TRENDYOL_API_TOKEN;
    this.userAgent = env.TRENDYOL_USER_AGENT || `${seller} - TrendyolBuyBoxGuard`;
    this.storeFrontCode = options?.storeFrontCode ?? env.TRENDYOL_STOREFRONT_CODE ?? undefined;
  }

  isConfigured() {
    return Boolean(this.sellerId && (this.apiToken || (this.apiKey && this.apiSecret)));
  }

  getSellerId() {
    return this.sellerId;
  }

  getStoreFrontCode() {
    return this.storeFrontCode ?? null;
  }

  private get authHeader() {
    const token =
      this.apiToken || Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64");

    return `Basic ${token}`;
  }

  private get defaultHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "User-Agent": this.userAgent,
      Accept: "application/json",
      "Content-Type": "application/json"
    };

    if (this.storeFrontCode) {
      headers.storeFrontCode = this.storeFrontCode;
    }

    return headers;
  }

  private toNumber(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private readPath(source: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((current, key) => {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const index = Number(key);
        if (!Number.isInteger(index)) {
          return undefined;
        }
        return current[index];
      }

      if (typeof current === "object") {
        return (current as Record<string, unknown>)[key];
      }

      return undefined;
    }, source);
  }

  private numberFromUnknown(value: unknown, depth = 0): number | null {
    if (depth > 3 || value === null || value === undefined) {
      return null;
    }

    const direct = this.toNumber(value);
    if (direct !== null) {
      return direct;
    }

    if (typeof value !== "object") {
      return null;
    }

    const objectValue = value as Record<string, unknown>;
    const priorityKeys = [
      "value",
      "amount",
      "price",
      "salePrice",
      "listPrice",
      "discountedPrice",
      "sellingPrice",
      "buyboxPrice",
      "net",
      "gross"
    ];

    for (const key of priorityKeys) {
      if (!(key in objectValue)) {
        continue;
      }
      const nested = this.numberFromUnknown(objectValue[key], depth + 1);
      if (nested !== null) {
        return nested;
      }
    }

    return null;
  }

  private pickNumber(source: unknown, paths: string[]): number | null {
    for (const path of paths) {
      const candidate = this.numberFromUnknown(this.readPath(source, path));
      if (candidate !== null) {
        return candidate;
      }
    }

    return null;
  }

  private extractPrice(source: unknown): number | null {
    const price = this.pickNumber(source, [
      "salePrice",
      "listPrice",
      "discountedPrice",
      "price",
      "sellingPrice",
      "buyboxPrice",
      "lowestPrice",
      "minimumPrice",
      "price.salePrice",
      "price.listPrice",
      "price.discountedPrice",
      "price.sellingPrice",
      "prices.salePrice",
      "prices.listPrice",
      "priceInfo.salePrice",
      "priceInfo.listPrice",
      "priceInfo.sellingPrice"
    ]);

    // Trendyol may return 0 / null-like prices for inactive or unpublished listings.
    // Treat non-positive values as unknown to avoid unsafe suggestions.
    if (price === null || price <= 0) {
      return null;
    }

    return price;
  }

  private extractStock(source: unknown): number | null {
    return this.pickNumber(source, [
      "quantity",
      "stock",
      "stockQuantity",
      "availableStock",
      "availableQuantity",
      "inventory",
      "stockCount",
      "onHandQuantity"
    ]);
  }

  private async request<T>(path: string, init?: RequestInit, retries = 3): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("Trendyol credentials are not configured");
    }

    const minGapMs = 180;
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < minGapMs) {
      await sleep(minGapMs - elapsed);
    }

    const url = `${this.baseUrl}${path}`;

    let attempt = 0;
    while (attempt <= retries) {
      attempt += 1;
      lastRequestAt = Date.now();

      const response = await fetch(url, {
        ...init,
        headers: {
          ...this.defaultHeaders,
          ...(init?.headers ?? {})
        },
        cache: "no-store"
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (![429, 500, 502, 503, 504].includes(response.status) || attempt > retries) {
        const body = await response.text();
        throw new Error(`Trendyol API ${response.status}: ${body.slice(0, 300)}`);
      }

      const backoff = 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 350);
      await sleep(backoff);
    }

    throw new Error("Trendyol request exhausted retries");
  }

  private extractListPayload(result: any): any[] {
    if (Array.isArray(result)) {
      return result;
    }

    const direct = [result?.content, result?.items, result?.products, result?.buyboxInfo];
    for (const candidate of direct) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    const nested = [
      result?.data?.content,
      result?.data?.items,
      result?.data?.products,
      result?.data?.buyboxInfo
    ];
    for (const candidate of nested) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
  }

  private parseBuyboxEntry(entry: any): TrendyolCompetitorData {
    const competitorMinPrice =
      this.pickNumber(entry, ["buyboxPrice", "buyboxPrice.value", "price", "lowestPrice", "minimumPrice"]) ??
      this.extractPrice(entry);

    const hasMultipleSeller =
      typeof entry?.hasMultipleSeller === "boolean"
        ? entry.hasMultipleSeller
        : typeof entry?.hasMultipleSellers === "boolean"
          ? entry.hasMultipleSellers
          : null;

    const competitorCount = hasMultipleSeller === null ? null : hasMultipleSeller ? 2 : 1;

    const buyboxOrder = this.pickNumber(entry, ["buyboxOrder", "order", "rank"]);

    const buyboxSellerId =
      entry?.buyboxSellerId?.toString?.() ??
      entry?.winnerSellerId?.toString?.() ??
      entry?.sellerId?.toString?.() ??
      entry?.buyboxSeller?.sellerId?.toString?.() ??
      null;

    const buyboxStatus =
      typeof buyboxOrder === "number"
        ? buyboxOrder === 1
          ? "WIN"
          : "LOSE"
        : buyboxSellerId
          ? String(buyboxSellerId) === String(this.sellerId)
            ? "WIN"
            : "LOSE"
          : "UNKNOWN";

    return {
      competitorMinPrice,
      competitorCount,
      buyboxSellerId,
      buyboxStatus,
      raw: entry
    };
  }

  async fetchBuyboxInformation(barcodes: string[]) {
    const unique = Array.from(new Set(barcodes.map((value) => String(value).trim()).filter(Boolean)));

    if (!unique.length) {
      return { raw: { note: "No barcodes provided" }, entries: [] as any[] };
    }

    const raw = await this.request<any>(
      `/integration/product/sellers/${this.sellerId}/products/buybox-information`,
      {
        method: "POST",
        body: JSON.stringify({
          barcodes: unique,
          supplierId: this.sellerId
        })
      }
    );

    return { raw, entries: this.extractListPayload(raw) };
  }

  private flattenProductsWithVariants(rows: any[]): any[] {
    const output: any[] = [];

    for (const row of rows) {
      const variants = Array.isArray(row?.variants) ? row.variants : [];

      if (!variants.length) {
        output.push(row);
        continue;
      }

      for (const variant of variants) {
        output.push({
          ...row,
          ...variant,
          __parent: row
        });
      }
    }

    return output;
  }

  private async fetchProductPayload(path: string) {
    const response = await this.request<any>(path);
    const list = this.flattenProductsWithVariants(this.extractListPayload(response));
    return { response, list };
  }

  private mapProductItem(item: any): TrendyolProductItem | null {
    const sku = String(
      item?.productCode ??
      item?.stockCode ??
      item?.merchantSku ??
      item?.productMainId ??
      item?.barcode ??
      item?.id ??
      ""
    ).trim();

    if (!sku) {
      return null;
    }

    return {
      sku,
      barcode: item?.barcode ? String(item.barcode) : null,
      title: String(item?.title ?? item?.name ?? sku),
      productId: item?.productMainId
        ? String(item.productMainId)
        : item?.contentId
          ? String(item.contentId)
          : item?.productCode
            ? String(item.productCode)
            : item?.id
              ? String(item.id)
              : null,
      category: item?.categoryName
        ? String(item.categoryName)
        : item?.category?.name
          ? String(item.category.name)
          : item?.category
            ? String(item.category)
            : null,
      active: item?.archived === true ? false : true,
      ourPrice: this.extractPrice(item),
      stock: this.extractStock(item),
      raw: item
    };
  }

  async fetchProducts(page = 0, size = 50): Promise<{ items: TrendyolProductItem[]; total?: number; totalPages?: number }> {
    const approvedPath = `/integration/product/sellers/${this.sellerId}/products/approved?page=${page}&size=${size}&supplierId=${this.sellerId}`;
    const legacyPath = `/integration/product/sellers/${this.sellerId}/products?page=${page}&size=${size}&supplierId=${this.sellerId}`;

    let raw: any;
    let list: any[] = [];

    try {
      const approved = await this.fetchProductPayload(approvedPath);
      raw = approved.response;
      list = approved.list;
    } catch {
      const legacy = await this.fetchProductPayload(legacyPath);
      raw = legacy.response;
      list = legacy.list;
    }

    if (!list.length && page === 0) {
      try {
        const fallback = await this.fetchProductPayload(legacyPath);
        if (fallback.list.length) {
          raw = fallback.response;
          list = fallback.list;
        }
      } catch {
        // Fallback is best-effort only.
      }
    }

    const items: TrendyolProductItem[] = list
      .map((item: any) => this.mapProductItem(item))
      .filter((item: TrendyolProductItem | null): item is TrendyolProductItem => item !== null);

    return {
      items,
      total:
        typeof raw?.totalElements === "number"
          ? raw.totalElements
          : typeof raw?.total === "number"
            ? raw.total
            : typeof raw?.data?.totalElements === "number"
              ? raw.data.totalElements
              : undefined,
      totalPages:
        typeof raw?.totalPages === "number"
          ? raw.totalPages
          : typeof raw?.pageCount === "number"
            ? raw.pageCount
            : typeof raw?.data?.totalPages === "number"
              ? raw.data.totalPages
              : undefined
    };
  }

  async fetchAllProducts(maxPages = 10, size = 100): Promise<TrendyolProductItem[]> {
    const seen = new Map<string, TrendyolProductItem>();
    let page = 0;

    while (page < maxPages) {
      const result = await this.fetchProducts(page, size);
      if (!result.items.length) {
        break;
      }

      for (const item of result.items) {
        seen.set(item.sku, item);
      }

      page += 1;

      if (result.totalPages !== undefined && page >= result.totalPages) {
        break;
      }
    }

    return Array.from(seen.values());
  }

  async fetchPriceAndStock(productRef: { sku?: string; barcode?: string; productId?: string }): Promise<TrendyolPriceStock> {
    const fallbackRef = productRef.barcode || productRef.sku || productRef.productId;
    const byBarcode = productRef.barcode ? `&barcode=${encodeURIComponent(productRef.barcode)}` : "";
    const byStockCode = !productRef.barcode && productRef.sku ? `&stockCode=${encodeURIComponent(productRef.sku)}` : "";

    const approvedPath = `/integration/product/sellers/${this.sellerId}/products/approved?page=0&size=50&supplierId=${this.sellerId}${byBarcode}${byStockCode}`;
    const legacyPath = `/integration/product/sellers/${this.sellerId}/products?page=0&size=50&supplierId=${this.sellerId}${byBarcode}${byStockCode}`;

    let raw: any;
    let list: any[] = [];

    try {
      const approved = await this.fetchProductPayload(approvedPath);
      raw = approved.response;
      list = approved.list;
    } catch {
      const legacy = await this.fetchProductPayload(legacyPath);
      raw = legacy.response;
      list = legacy.list;
    }

    const item = list.find((candidate: any) => {
      const stockCode = String(candidate?.stockCode ?? "");
      const productCode = String(candidate?.productCode ?? "");
      const merchantSku = String(candidate?.merchantSku ?? "");
      const barcode = String(candidate?.barcode ?? "");
      const mainId = String(candidate?.productMainId ?? "");
      const contentId = String(candidate?.contentId ?? "");
      const id = String(candidate?.id ?? "");
      return [stockCode, productCode, merchantSku, barcode, mainId, contentId, id].includes(
        String(fallbackRef ?? "")
      );
    }) ?? list[0];

    const ourPrice = this.extractPrice(item);
    const stock = this.extractStock(item);

    return {
      ourPrice,
      stock,
      raw
    };
  }

  async fetchCompetitorPrices(productRef: {
    sku?: string;
    barcode?: string;
    productId?: string;
  }): Promise<TrendyolCompetitorData> {
    const reference = productRef.barcode || productRef.sku;

    if (!reference) {
      return {
        competitorMinPrice: null,
        competitorCount: null,
        buyboxSellerId: null,
        buyboxStatus: "UNKNOWN",
        raw: { note: "No barcode/sku provided for buybox lookup" }
      };
    }

    try {
      const { raw, entries } = await this.fetchBuyboxInformation([reference]);

      const entry =
        entries.find((item: any) =>
          [String(item?.barcode ?? ""), String(item?.stockCode ?? "")].includes(String(reference))
        ) ?? entries[0];

      if (!entry) {
        return {
          competitorMinPrice: null,
          competitorCount: null,
          buyboxSellerId: null,
          buyboxStatus: "UNKNOWN",
          raw: { note: "Buybox lookup returned no entries", response: raw }
        };
      }

      const parsed = this.parseBuyboxEntry(entry);

      return {
        ...parsed,
        // Keep raw response for debugging without expanding to huge payloads.
        raw: {
          source: "buybox_information",
          entry: parsed.raw,
          responseMeta: {
            hasEntries: Array.isArray(entries) ? entries.length : 0
          }
        }
      };
    } catch (error) {
      return {
        competitorMinPrice: null,
        competitorCount: null,
        buyboxSellerId: null,
        buyboxStatus: "UNKNOWN",
        raw: {
          note: "Buybox endpoint unavailable",
          error: error instanceof Error ? error.message : "unknown"
        }
      };
    }
  }

  async updatePrice(barcodeOrSku: string, newPrice: number): Promise<TrendyolPriceUpdateResponse> {
    const payload = {
      items: [
        {
          barcode: barcodeOrSku,
          stockCode: barcodeOrSku,
          salePrice: newPrice,
          listPrice: newPrice
        }
      ]
    };

    const raw = await this.request<any>(
      `/integration/inventory/sellers/${this.sellerId}/products/price-and-inventory`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );

    return {
      accepted: true,
      raw
    };
  }

  async fetchShipmentPackages(
    options: import("@/lib/trendyol/shipments/types").FetchShipmentsOptions
  ): Promise<{ content: import("@/lib/trendyol/shipments/types").TrendyolShipmentPackage[]; totalPages: number }> {
    const params = new URLSearchParams();
    params.set("page", String(options.page ?? 0));
    params.set("size", String(options.size ?? 50));

    if (options.startDate) params.set("startDate", String(options.startDate));
    if (options.endDate) params.set("endDate", String(options.endDate));
    if (options.status) params.set("shipmentPackageStatus", options.status);
    if (options.orderByField) params.set("orderByField", options.orderByField);
    if (options.orderByDirection) params.set("orderByDirection", options.orderByDirection);

    const qs = params.toString();
    const url = `/integration/order/sellers/${this.sellerId}/shipment-packages?${qs}`;

    const response = await this.request<any>(url);

    return {
      content: Array.isArray(response.content) ? response.content : [],
      totalPages: typeof response.totalPages === "number" ? response.totalPages : 0
    };
  }
}

export const trendyolClient = new TrendyolClient();

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

    const direct = [result?.content, result?.items, result?.products];
    for (const candidate of direct) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    const nested = [result?.data?.content, result?.data?.items, result?.data?.products];
    for (const candidate of nested) {
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }

    return [];
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
      ourPrice:
        this.toNumber(item?.salePrice) ??
        this.toNumber(item?.price) ??
        this.toNumber(item?.listPrice) ??
        this.toNumber(item?.discountedPrice),
      stock:
        this.toNumber(item?.quantity) ??
        this.toNumber(item?.stock) ??
        this.toNumber(item?.stockQuantity),
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

    const ourPrice =
      this.toNumber(item?.salePrice) ??
      this.toNumber(item?.price) ??
      this.toNumber(item?.listPrice) ??
      this.toNumber(item?.discountedPrice);

    const stock =
      this.toNumber(item?.quantity) ??
      this.toNumber(item?.stock) ??
      this.toNumber(item?.stockQuantity);

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
      const raw = await this.request<any>(
        `/integration/product/sellers/${this.sellerId}/products/buybox-information`,
        {
          method: "POST",
          body: JSON.stringify({
            barcodes: [reference],
            supplierId: this.sellerId
          })
        }
      );

      const entries = this.extractListPayload(raw);
      const entry = entries.find((item: any) =>
        [String(item?.barcode ?? ""), String(item?.stockCode ?? "")].includes(String(reference))
      ) ?? entries[0] ?? raw;

      const offerRows: any[] = Array.isArray(entry?.offers)
        ? entry.offers
        : Array.isArray(entry?.sellers)
          ? entry.sellers
          : [];

      const minOfferPrice = offerRows
        .map((offer) =>
          this.toNumber(offer?.price ?? offer?.salePrice ?? offer?.buyboxPrice ?? offer?.amount)
        )
        .filter((value): value is number => value !== null)
        .reduce<number | null>((min, price) => (min === null || price < min ? price : min), null);

      const competitorMinPrice =
        this.toNumber(
          entry?.buyboxPrice ?? entry?.competitorMinPrice ?? entry?.minimumPrice ?? entry?.price
        ) ?? minOfferPrice;

      const buyboxSellerId =
        entry?.buyboxSellerId?.toString?.() ??
        entry?.winnerSellerId?.toString?.() ??
        entry?.sellerId?.toString?.() ??
        entry?.buyboxSeller?.sellerId?.toString?.() ??
        null;

      const competitorCount =
        this.toNumber(entry?.competitorCount ?? entry?.sellerCount) ??
        (offerRows.length ? offerRows.length : null);

      const buyboxStatus = buyboxSellerId
        ? String(buyboxSellerId) === String(this.sellerId)
          ? "WIN"
          : "LOSE"
        : "UNKNOWN";

      return {
        competitorMinPrice,
        competitorCount,
        buyboxSellerId,
        buyboxStatus,
        raw
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
}

export const trendyolClient = new TrendyolClient();

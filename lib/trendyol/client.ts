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

class TrendyolClient {
  private sellerId: string;
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;
  private apiToken?: string;
  private userAgent: string;

  constructor(options?: TrendyolClientOptions) {
    const seller = options?.supplierId ?? env.TRENDYOL_SUPPLIER_ID ?? env.TRENDYOL_SELLER_ID ?? "";

    this.sellerId = seller;
    this.baseUrl = options?.baseUrl ?? env.TRENDYOL_BASE_URL;
    this.apiKey = options?.apiKey ?? env.TRENDYOL_API_KEY ?? "";
    this.apiSecret = options?.apiSecret ?? env.TRENDYOL_API_SECRET ?? "";
    this.apiToken = env.TRENDYOL_API_TOKEN;
    this.userAgent = env.TRENDYOL_USER_AGENT || `${seller} - TrendyolBuyBoxGuard`;
  }

  isConfigured() {
    return Boolean(this.sellerId && (this.apiToken || (this.apiKey && this.apiSecret)));
  }

  getSellerId() {
    return this.sellerId;
  }

  private get authHeader() {
    const token =
      this.apiToken || Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64");

    return `Basic ${token}`;
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
          Authorization: this.authHeader,
          "User-Agent": this.userAgent,
          Accept: "application/json",
          "Content-Type": "application/json",
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
        : item?.productCode
          ? String(item.productCode)
          : item?.id
            ? String(item.id)
            : null,
      category: item?.categoryName
        ? String(item.categoryName)
        : item?.category
          ? String(item.category)
          : null,
      active: item?.archived === true ? false : true
    };
  }

  async fetchProducts(page = 0, size = 50): Promise<{ items: TrendyolProductItem[]; total?: number; totalPages?: number }> {
    const result = await this.request<any>(
      `/integration/product/sellers/${this.sellerId}/products?page=${page}&size=${size}&supplierId=${this.sellerId}`
    );

    const content = this.extractListPayload(result);
    const items: TrendyolProductItem[] = content
      .map((item: any) => this.mapProductItem(item))
      .filter((item: TrendyolProductItem | null): item is TrendyolProductItem => item !== null);

    return {
      items,
      total:
        typeof result?.totalElements === "number"
          ? result.totalElements
          : typeof result?.total === "number"
            ? result.total
            : undefined,
      totalPages:
        typeof result?.totalPages === "number"
          ? result.totalPages
          : typeof result?.pageCount === "number"
            ? result.pageCount
            : undefined
    };
  }

  async fetchPriceAndStock(productRef: { sku?: string; barcode?: string; productId?: string }): Promise<TrendyolPriceStock> {
    const fallbackRef = productRef.barcode || productRef.sku || productRef.productId;
    const byBarcode = productRef.barcode ? `&barcode=${encodeURIComponent(productRef.barcode)}` : "";
    const byStockCode = !productRef.barcode && productRef.sku ? `&stockCode=${encodeURIComponent(productRef.sku)}` : "";

    const raw = await this.request<any>(
      `/integration/product/sellers/${this.sellerId}/products?page=0&size=50&supplierId=${this.sellerId}${byBarcode}${byStockCode}`
    );

    const content = this.extractListPayload(raw);
    const item = content.find((candidate: any) => {
      const stockCode = String(candidate?.stockCode ?? "");
      const productCode = String(candidate?.productCode ?? "");
      const barcode = String(candidate?.barcode ?? "");
      const mainId = String(candidate?.productMainId ?? "");
      const id = String(candidate?.id ?? "");
      return [stockCode, productCode, barcode, mainId, id].includes(String(fallbackRef ?? ""));
    }) ?? content[0];

    return {
      ourPrice: item?.salePrice !== undefined ? Number(item.salePrice) : null,
      stock: item?.quantity !== undefined ? Number(item.quantity) : null,
      raw
    };
  }

  async fetchCompetitorPrices(_productRef: {
    sku?: string;
    barcode?: string;
    productId?: string;
  }): Promise<TrendyolCompetitorData> {
    return {
      competitorMinPrice: null,
      competitorCount: null,
      buyboxSellerId: null,
      buyboxStatus: "UNKNOWN",
      raw: {
        note: "Competitor endpoint is not available in this integration profile"
      }
    };
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
      `/integration/product/sellers/${this.sellerId}/products/price-and-inventory`,
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

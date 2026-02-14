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
  private supplierId: string;
  private baseUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(options?: TrendyolClientOptions) {
    this.supplierId = options?.supplierId ?? env.TRENDYOL_SUPPLIER_ID ?? "";
    this.baseUrl = options?.baseUrl ?? env.TRENDYOL_BASE_URL;
    this.apiKey = options?.apiKey ?? env.TRENDYOL_API_KEY ?? "";
    this.apiSecret = options?.apiSecret ?? env.TRENDYOL_API_SECRET ?? "";
  }

  isConfigured() {
    return Boolean(this.supplierId && this.apiKey && this.apiSecret);
  }

  private get authHeader() {
    const token = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64");
    return `Basic ${token}`;
  }

  private async request<T>(path: string, init?: RequestInit, retries = 3): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("Trendyol credentials are not configured");
    }

    const minGapMs = 200;
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
        throw new Error(`Trendyol API ${response.status}: ${body.slice(0, 500)}`);
      }

      const backoff = 300 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(backoff);
    }

    throw new Error("Trendyol request exhausted retries");
  }

  async fetchProducts(page = 0, size = 50): Promise<{ items: TrendyolProductItem[]; total?: number }> {
    const result = await this.request<any>(
      `/suppliers/${this.supplierId}/products?page=${page}&size=${size}`
    );

    const content = Array.isArray(result?.content) ? result.content : [];

    const items: TrendyolProductItem[] = content.map((item: any) => ({
      sku: String(item?.stockCode ?? item?.sku ?? item?.barcode ?? ""),
      barcode: item?.barcode ? String(item.barcode) : null,
      title: String(item?.title ?? item?.productMainId ?? "Untitled"),
      productId: item?.productMainId ? String(item.productMainId) : null,
      category: item?.categoryName ? String(item.categoryName) : null,
      active: item?.archived === true ? false : true
    }));

    return {
      items,
      total: typeof result?.totalElements === "number" ? result.totalElements : undefined
    };
  }

  async fetchPriceAndStock(productRef: { sku?: string; barcode?: string; productId?: string }): Promise<TrendyolPriceStock> {
    const reference = productRef.barcode || productRef.sku || productRef.productId;
    const query = encodeURIComponent(reference ?? "");

    const raw = await this.request<any>(
      `/suppliers/${this.supplierId}/products?barcode=${query}&size=1&page=0`
    );

    const item = Array.isArray(raw?.content) ? raw.content[0] : null;
    const listPrice = item?.salePrice ?? item?.listPrice ?? null;

    return {
      ourPrice: listPrice !== null ? Number(listPrice) : null,
      stock: item?.quantity !== undefined ? Number(item.quantity) : null,
      raw
    };
  }

  async fetchCompetitorPrices(productRef: { sku?: string; barcode?: string; productId?: string }): Promise<TrendyolCompetitorData> {
    const productId = productRef.productId || productRef.sku || productRef.barcode;

    try {
      const raw = await this.request<any>(
        `/suppliers/${this.supplierId}/products/${encodeURIComponent(String(productId ?? ""))}/competitive-prices`
      );

      const offers = Array.isArray(raw?.offers) ? raw.offers : [];
      const sorted = offers
        .map((offer: any) => ({
          sellerId: offer?.sellerId ? String(offer.sellerId) : null,
          price: Number(offer?.price),
          inStock: offer?.inStock !== false
        }))
        .filter((offer: any) => Number.isFinite(offer.price) && offer.inStock)
        .sort((a: any, b: any) => a.price - b.price);

      const min = sorted[0];

      return {
        competitorMinPrice: min ? Number(min.price) : null,
        competitorCount: sorted.length,
        buyboxSellerId: raw?.buyboxSellerId ? String(raw.buyboxSellerId) : min?.sellerId ?? null,
        buyboxStatus: "UNKNOWN",
        raw
      };
    } catch {
      return {
        competitorMinPrice: null,
        competitorCount: null,
        buyboxSellerId: null,
        buyboxStatus: "UNKNOWN",
        raw: { note: "Competitor endpoint unavailable" }
      };
    }
  }

  async updatePrice(barcodeOrSku: string, newPrice: number): Promise<TrendyolPriceUpdateResponse> {
    const payload = {
      items: [
        {
          barcode: barcodeOrSku,
          salePrice: newPrice,
          listPrice: newPrice,
          quantity: 999
        }
      ]
    };

    const raw = await this.request<any>(
      `/suppliers/${this.supplierId}/products/price-and-inventory`,
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

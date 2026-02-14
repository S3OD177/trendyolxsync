export interface TrendyolProductItem {
  sku: string;
  barcode?: string | null;
  title: string;
  productId?: string | null;
  category?: string | null;
  active: boolean;
  ourPrice?: number | null;
  stock?: number | null;
  raw?: unknown;
}

export interface TrendyolPriceStock {
  ourPrice: number | null;
  stock: number | null;
  raw: unknown;
}

export interface TrendyolCompetitorData {
  competitorMinPrice: number | null;
  competitorCount: number | null;
  buyboxSellerId: string | null;
  buyboxStatus: "WIN" | "LOSE" | "UNKNOWN";
  raw: unknown;
}

export interface TrendyolPriceUpdateResponse {
  accepted: boolean;
  raw: unknown;
}

export interface TrendyolClientOptions {
  supplierId?: string;
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  storeFrontCode?: string;
}

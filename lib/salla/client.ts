import { env } from "@/lib/config/env";
import type { SallaProductRecord } from "@/lib/salla/types";

const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const MIN_REQUEST_GAP_MS = 180;

let lastRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readPath(source: unknown, path: string): unknown {
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

function numberFromUnknown(value: unknown, depth = 0): number | null {
  if (depth > 3 || value === null || value === undefined) {
    return null;
  }

  const direct = toNumber(value);
  if (direct !== null) {
    return direct;
  }

  if (typeof value !== "object") {
    return null;
  }

  const objectValue = value as Record<string, unknown>;
  for (const key of ["value", "amount", "price", "net", "raw", "exclusive"]) {
    if (!(key in objectValue)) {
      continue;
    }

    const nested = numberFromUnknown(objectValue[key], depth + 1);
    if (nested !== null) {
      return nested;
    }
  }

  return null;
}

function pickNumber(source: unknown, paths: string[]): number | null {
  for (const path of paths) {
    const numeric = numberFromUnknown(readPath(source, path));
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
}

function toObject(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function mapSallaProduct(raw: unknown): SallaProductRecord | null {
  const source = toObject(raw);
  if (!source) {
    return null;
  }

  const idValue = source.id ?? source.product_id ?? source.productId ?? source.sku ?? null;
  const id = idValue === null ? "" : String(idValue).trim();
  if (!id) {
    return null;
  }

  const skuValue = source.sku ?? source.product_sku ?? source.sku_code ?? null;
  const skuRaw = skuValue === null || skuValue === undefined ? null : String(skuValue).trim();
  const sku = skuRaw && skuRaw.length > 0 ? skuRaw : null;

  const nameRaw = source.name ?? source.title ?? source.product_name ?? sku ?? id;
  const name = String(nameRaw ?? id).trim();

  const quantity = pickNumber(source, [
    "quantity",
    "stock",
    "inventory",
    "inventory.quantity",
    "variants.0.quantity",
    "variants.0.stock"
  ]);

  const preTaxPrice = pickNumber(source, [
    "pre_tax_price.amount",
    "pre_tax_price",
    "price.excluding_tax",
    "price.amount_excluding_tax",
    "price.tax_exclusive",
    "sale_price.excluding_tax"
  ]);

  const costPrice = pickNumber(source, [
    "cost_price.amount",
    "cost_price",
    "cost.amount",
    "cost",
    "purchase_price.amount",
    "purchase_price"
  ]);

  return {
    id,
    sku,
    name,
    quantity,
    preTaxPrice,
    costPrice,
    raw
  };
}

function extractListPayload(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    return result;
  }

  const object = toObject(result);
  if (!object) {
    return [];
  }

  if (Array.isArray(object.data)) {
    return object.data;
  }

  const nestedData = toObject(object.data);
  if (nestedData && Array.isArray(nestedData.data)) {
    return nestedData.data;
  }

  if (Array.isArray(object.items)) {
    return object.items;
  }

  const pagination = toObject(object.pagination);
  if (pagination && Array.isArray(pagination.data)) {
    return pagination.data;
  }

  return [];
}

function extractObjectPayload(result: unknown): unknown {
  if (Array.isArray(result)) {
    return result[0] ?? null;
  }

  const object = toObject(result);
  if (!object) {
    return null;
  }

  const directData = object.data;
  if (directData && !Array.isArray(directData)) {
    const nested = toObject(directData);
    if (nested && nested.data && !Array.isArray(nested.data)) {
      return nested.data;
    }
    return directData;
  }

  return object;
}

export class SallaClient {
  private baseUrl: string;
  private accessToken: string;

  constructor() {
    this.baseUrl = env.SALLA_BASE_URL;
    this.accessToken = env.SALLA_ACCESS_TOKEN ?? "";
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.accessToken);
  }

  async hasCredential() {
    return this.isConfigured();
  }

  async getCredentialSummary() {
    if (!this.isConfigured()) {
      return null;
    }

    return {
      source: "env",
      tokenConfigured: true
    };
  }

  private async request<T>(path: string, init?: RequestInit, retries = 3): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("Salla credentials are not configured. Set SALLA_ACCESS_TOKEN.");
    }

    const method = init?.method ?? "GET";
    const url = `${this.baseUrl}${path}`;
    let attempt = 0;

    while (attempt <= retries) {
      attempt += 1;

      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < MIN_REQUEST_GAP_MS) {
        await sleep(MIN_REQUEST_GAP_MS - elapsed);
      }
      lastRequestAt = Date.now();

      const response = await fetch(url, {
        ...init,
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.accessToken}`,
          ...(init?.headers ?? {})
        },
        cache: "no-store"
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (attempt <= retries && RETRYABLE_HTTP_STATUS.has(response.status)) {
        const backoffMs = Math.min(2_500, 300 * 2 ** (attempt - 1));
        await sleep(backoffMs);
        continue;
      }

      const body = await response.text().catch(() => "");
      throw new Error(`Salla API ${response.status}: ${body.slice(0, 200)}`);
    }

    throw new Error("Salla request exhausted retries");
  }

  async fetchProductBySku(sku: string) {
    const normalizedSku = sku.trim();
    if (!normalizedSku) {
      return null;
    }

    const response = await this.request<unknown>(`/products/sku/${encodeURIComponent(normalizedSku)}`);
    const payload = extractObjectPayload(response);
    return mapSallaProduct(payload);
  }

  async searchProductsByKeyword(keyword: string, page = 1, pageSize = 25) {
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      return [] as SallaProductRecord[];
    }

    const params = new URLSearchParams({
      keyword: normalizedKeyword,
      page: String(page),
      per_page: String(Math.max(1, Math.min(100, pageSize)))
    });

    const response = await this.request<unknown>(`/products?${params.toString()}`);
    const rows = extractListPayload(response);

    const products: SallaProductRecord[] = [];
    for (const row of rows) {
      const mapped = mapSallaProduct(row);
      if (mapped) {
        products.push(mapped);
      }
    }

    return products;
  }
}

export const sallaClient = new SallaClient();

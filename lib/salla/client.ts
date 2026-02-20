import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "@/lib/config/env";
import type { SallaOAuthTokenPayload, SallaProductRecord } from "@/lib/salla/types";

const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const MIN_REQUEST_GAP_MS = 180;
const OAUTH_REFRESH_BUFFER_MS = 30_000;
const CREDENTIAL_STORE_DIR = path.join(os.tmpdir(), "trendyolxsync");
const CREDENTIAL_STORE_PATH = path.join(CREDENTIAL_STORE_DIR, "salla-oauth-credential.json");

let lastRequestAt = 0;

interface RuntimeSallaCredential {
  source: "oauth";
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  merchantId: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

interface StoredSallaCredential {
  version: 1;
  source: "oauth";
  accessTokenEncoded: string;
  refreshTokenEncoded: string | null;
  tokenType: string | null;
  scope: string | null;
  merchantId: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readPath(source: unknown, pathValue: string): unknown {
  return pathValue.split(".").reduce<unknown>((current, key) => {
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
  for (const pathValue of paths) {
    const numeric = numberFromUnknown(readPath(source, pathValue));
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
}

function toObject(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function encodeToken(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeToken(value: string) {
  return Buffer.from(value, "base64").toString("utf8");
}

function isDateExpired(value: string | null, bufferMs = 0) {
  if (!value) {
    return false;
  }

  const expiresAt = new Date(value).getTime();
  if (!Number.isFinite(expiresAt)) {
    return false;
  }

  return Date.now() + bufferMs >= expiresAt;
}

function toIsoDateFromExpiresIn(expiresIn: unknown) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(Date.now() + seconds * 1000).toISOString();
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
  private oauthBaseUrl: string;
  private accessTokenFromEnv: string;
  private oauthClientId: string;
  private oauthClientSecret: string;
  private oauthRedirectUri: string;
  private cachedCredential: RuntimeSallaCredential | null = null;
  private loadedCredentialFromStore = false;

  constructor() {
    this.baseUrl = env.SALLA_BASE_URL.replace(/\/+$/, "");
    this.oauthBaseUrl = env.SALLA_OAUTH_BASE_URL.replace(/\/+$/, "");
    this.accessTokenFromEnv = (env.SALLA_ACCESS_TOKEN ?? "").trim();
    this.oauthClientId = (env.SALLA_CLIENT_ID ?? "").trim();
    this.oauthClientSecret = (env.SALLA_CLIENT_SECRET ?? "").trim();
    this.oauthRedirectUri = (env.SALLA_REDIRECT_URI ?? "").trim();
  }

  isOAuthReady() {
    return Boolean(
      this.oauthBaseUrl &&
      this.oauthClientId &&
      this.oauthClientSecret &&
      this.oauthRedirectUri
    );
  }

  isConfigured() {
    return Boolean(this.baseUrl && (this.accessTokenFromEnv || this.readStoredCredentialSync()?.accessToken));
  }

  async hasCredential() {
    const token = await this.getAccessToken();
    return Boolean(this.baseUrl && token);
  }

  getAuthorizationUrl(state: string) {
    if (!this.isOAuthReady()) {
      throw new Error(
        "Salla OAuth is not configured. Set SALLA_CLIENT_ID, SALLA_CLIENT_SECRET, and SALLA_REDIRECT_URI."
      );
    }

    const url = new URL("/oauth2/auth", this.oauthBaseUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.oauthClientId);
    url.searchParams.set("redirect_uri", this.oauthRedirectUri);
    url.searchParams.set("scope", "offline_access");
    url.searchParams.set("state", state);
    return url.toString();
  }

  async connectWithAuthorizationCode(code: string) {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new Error("Missing OAuth authorization code.");
    }

    const payload = await this.requestOAuthToken({
      grant_type: "authorization_code",
      code: normalizedCode,
      redirect_uri: this.oauthRedirectUri
    });

    return this.persistOAuthCredential(payload);
  }

  async getCredentialSummary() {
    if (this.accessTokenFromEnv) {
      return {
        source: "env",
        tokenConfigured: true
      };
    }

    const credential = await this.getActiveCredential();
    if (!credential) {
      return null;
    }

    return {
      source: credential.source,
      tokenConfigured: true,
      tokenType: credential.tokenType ?? "Bearer",
      scope: credential.scope,
      merchantId: credential.merchantId,
      expiresAt: credential.expiresAt,
      expired: isDateExpired(credential.expiresAt)
    };
  }

  private readStoredCredentialSync() {
    if (this.loadedCredentialFromStore) {
      return this.cachedCredential;
    }

    this.loadedCredentialFromStore = true;

    try {
      if (!fs.existsSync(CREDENTIAL_STORE_PATH)) {
        this.cachedCredential = null;
        return null;
      }

      const raw = fs.readFileSync(CREDENTIAL_STORE_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoredSallaCredential>;

      if (!parsed || parsed.source !== "oauth" || typeof parsed.accessTokenEncoded !== "string") {
        this.cachedCredential = null;
        return null;
      }

      const credential: RuntimeSallaCredential = {
        source: "oauth",
        accessToken: decodeToken(parsed.accessTokenEncoded),
        refreshToken: parsed.refreshTokenEncoded ? decodeToken(parsed.refreshTokenEncoded) : null,
        tokenType: parsed.tokenType ?? null,
        scope: parsed.scope ?? null,
        merchantId: parsed.merchantId ?? null,
        expiresAt: parsed.expiresAt ?? null,
        updatedAt: parsed.updatedAt ?? new Date().toISOString()
      };

      this.cachedCredential = credential;
      return credential;
    } catch {
      this.cachedCredential = null;
      return null;
    }
  }

  private async writeStoredCredential(credential: RuntimeSallaCredential) {
    const payload: StoredSallaCredential = {
      version: 1,
      source: "oauth",
      accessTokenEncoded: encodeToken(credential.accessToken),
      refreshTokenEncoded: credential.refreshToken ? encodeToken(credential.refreshToken) : null,
      tokenType: credential.tokenType,
      scope: credential.scope,
      merchantId: credential.merchantId,
      expiresAt: credential.expiresAt,
      updatedAt: credential.updatedAt
    };

    await fsPromises.mkdir(CREDENTIAL_STORE_DIR, { recursive: true });
    await fsPromises.writeFile(CREDENTIAL_STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
  }

  private async persistOAuthCredential(payload: SallaOAuthTokenPayload) {
    if (!payload.access_token || !payload.access_token.trim()) {
      throw new Error("Salla OAuth did not return an access token.");
    }

    const merchantIdRaw = payload.merchant_id ?? payload.merchant?.id ?? null;

    const credential: RuntimeSallaCredential = {
      source: "oauth",
      accessToken: payload.access_token.trim(),
      refreshToken: payload.refresh_token ? payload.refresh_token.trim() : null,
      tokenType: payload.token_type ? payload.token_type.trim() : null,
      scope: payload.scope ? payload.scope.trim() : null,
      merchantId: merchantIdRaw === null || merchantIdRaw === undefined ? null : String(merchantIdRaw),
      expiresAt: toIsoDateFromExpiresIn(payload.expires_in),
      updatedAt: new Date().toISOString()
    };

    this.cachedCredential = credential;
    this.loadedCredentialFromStore = true;

    try {
      await this.writeStoredCredential(credential);
    } catch {
      // Keep in-memory credential if local storage write fails.
    }

    return {
      source: credential.source,
      tokenConfigured: true,
      merchantId: credential.merchantId,
      expiresAt: credential.expiresAt
    };
  }

  private async requestOAuthToken(input: Record<string, string>) {
    if (!this.isOAuthReady()) {
      throw new Error(
        "Salla OAuth is not configured. Set SALLA_CLIENT_ID, SALLA_CLIENT_SECRET, and SALLA_REDIRECT_URI."
      );
    }

    const body = new URLSearchParams({
      ...input,
      client_id: this.oauthClientId,
      client_secret: this.oauthClientSecret
    });

    const response = await fetch(`${this.oauthBaseUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString(),
      cache: "no-store"
    });

    const raw = await response.text().catch(() => "");
    let payload: Partial<SallaOAuthTokenPayload> & { message?: string } = {};

    if (raw) {
      try {
        payload = JSON.parse(raw) as Partial<SallaOAuthTokenPayload> & { message?: string };
      } catch {
        payload = {};
      }
    }

    if (!response.ok) {
      const message = typeof payload.message === "string"
        ? payload.message
        : raw.slice(0, 200) || `HTTP ${response.status}`;
      throw new Error(`Salla OAuth token exchange failed (${response.status}): ${message}`);
    }

    if (!payload.access_token || typeof payload.access_token !== "string") {
      throw new Error("Salla OAuth token exchange returned no access token.");
    }

    return payload as SallaOAuthTokenPayload;
  }

  private async refreshStoredCredential(credential: RuntimeSallaCredential) {
    if (!credential.refreshToken || !this.isOAuthReady()) {
      return credential;
    }

    const payload = await this.requestOAuthToken({
      grant_type: "refresh_token",
      refresh_token: credential.refreshToken
    });

    await this.persistOAuthCredential(payload);
    return this.cachedCredential ?? credential;
  }

  private async getActiveCredential() {
    if (this.accessTokenFromEnv) {
      return null;
    }

    const credential = this.cachedCredential ?? this.readStoredCredentialSync();
    if (!credential) {
      return null;
    }

    if (!isDateExpired(credential.expiresAt, OAUTH_REFRESH_BUFFER_MS)) {
      return credential;
    }

    try {
      return await this.refreshStoredCredential(credential);
    } catch {
      if (isDateExpired(credential.expiresAt)) {
        return null;
      }
      return credential;
    }
  }

  private async getAccessToken() {
    if (this.accessTokenFromEnv) {
      return this.accessTokenFromEnv;
    }

    const credential = await this.getActiveCredential();
    if (!credential) {
      return null;
    }

    return credential.accessToken;
  }

  private async request<T>(pathValue: string, init?: RequestInit, retries = 3): Promise<T> {
    const accessToken = await this.getAccessToken();
    if (!this.baseUrl || !accessToken) {
      throw new Error("Salla credentials are not configured. Connect via OAuth or set SALLA_ACCESS_TOKEN.");
    }

    const method = init?.method ?? "GET";
    const url = `${this.baseUrl}${pathValue}`;
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
          Authorization: `Bearer ${accessToken}`,
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

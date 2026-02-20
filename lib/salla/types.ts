export type SallaCostSource = "PRE_TAX" | "COST_PRICE";
export type SallaMatchMethod = "SKU" | "NAME";

export interface SallaProductRecord {
  id: string;
  sku: string | null;
  name: string;
  quantity: number | null;
  preTaxPrice: number | null;
  costPrice: number | null;
  raw: unknown;
}

export interface SallaOAuthTokenPayload {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  merchant_id?: string | number;
  merchant?: {
    id?: string | number;
  };
}

export interface SallaMatchOutcome {
  matched: boolean;
  method: SallaMatchMethod | null;
  score: number | null;
  reason: "MATCHED" | "NO_CANDIDATES" | "NO_CONFIDENT_MATCH";
  product: SallaProductRecord | null;
  candidates: Array<{
    id: string;
    sku: string | null;
    name: string;
    score: number;
  }>;
}

export interface SallaBatchSyncOptions {
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
  persist?: boolean;
  dryRun?: boolean;
}

export interface SallaBatchSyncError {
  productId: string;
  sku: string;
  message: string;
}

export interface SallaBatchSyncSummary {
  ok: boolean;
  total: number;
  processed: number;
  matched: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
  persist: boolean;
  errors: SallaBatchSyncError[];
}

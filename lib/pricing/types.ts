import type { MinProfitType, ServiceFeeType, VatMode } from "@prisma/client";

export interface EffectiveProductSettings {
  costPrice: number;
  feePercent: number;
  commissionRate: number;
  serviceFeeType: ServiceFeeType;
  serviceFeeValue: number;
  shippingCost: number;
  handlingCost: number;
  vatRate: number;
  vatMode: VatMode;
  minProfitType: MinProfitType;
  minProfitValue: number;
  undercutStep: number;
  alertThresholdSar: number;
  alertThresholdPct: number;
  cooldownMinutes: number;
  competitorDropPct: number;
}

export interface PriceComputationResult {
  grossRevenue: number;
  vatAmount: number;
  commissionFee: number;
  serviceFee: number;
  shippingCost: number;
  handlingCost: number;
  totalFees: number;
  netRevenue: number;
  profitSar: number;
  profitPct: number;
}

export interface SuggestedPriceArgs {
  competitorMin: number | null;
  ourPrice: number | null;
  settings: EffectiveProductSettings;
  minPrice?: number | null;
  lastDownwardChangeAt?: Date | null;
  now?: Date;
  bypassCooldown?: boolean;
}

export interface SuggestedPriceResult {
  suggested: number | null;
  floor: number;
  target: number | null;
  reason:
    | "NO_COMPETITOR_DATA"
    | "FLOOR_INVALID"
    | "COOLDOWN_ACTIVE"
    | "ABOVE_FLOOR"
    | "FLOOR_PROTECTED"
    | "NO_CHANGE";
}

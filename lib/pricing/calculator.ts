import type { EffectiveProductSettings, PriceComputationResult } from "@/lib/pricing/types";
import { ceilMoney, roundMoney } from "@/lib/utils/money";

const FIXED_VAT_RATE = 0.15;

export function normalizeFeeRate(input: number): number {
  if (!Number.isFinite(input) || input < 0) {
    throw new RangeError("Fee percentage must be a non-negative number");
  }

  if (input < 1) {
    return input;
  }

  if (input <= 100) {
    return input / 100;
  }

  throw new RangeError("Fee percentage cannot exceed 100%");
}

function resolveFeeInput(settings: EffectiveProductSettings): number {
  return Number.isFinite(settings.feePercent) ? settings.feePercent : settings.commissionRate;
}

function resolveFeeRate(settings: EffectiveProductSettings): number {
  return normalizeFeeRate(resolveFeeInput(settings));
}

function baseNoLossFloor(settings: EffectiveProductSettings): number {
  const costPrice = Math.max(0, settings.costPrice);
  const shippingCost = Math.max(0, settings.shippingCost);
  const feeRate = resolveFeeRate(settings);

  const vatAmount = costPrice * FIXED_VAT_RATE;
  const feeAmount = costPrice * feeRate;

  return costPrice + vatAmount + shippingCost + feeAmount;
}

export function computeFees(price: number, settings: EffectiveProductSettings): PriceComputationResult {
  const grossRevenue = Math.max(0, price);
  const costPrice = Math.max(0, settings.costPrice);
  const shippingCost = Math.max(0, settings.shippingCost);

  let feeRate: number;
  try {
    feeRate = resolveFeeRate(settings);
  } catch {
    feeRate = Number.POSITIVE_INFINITY;
  }

  const vatAmount = costPrice * FIXED_VAT_RATE;
  const commissionFee = Number.isFinite(feeRate) ? costPrice * feeRate : Number.POSITIVE_INFINITY;
  const serviceFee = 0;
  const handlingCost = 0;

  const totalFees = commissionFee + serviceFee + shippingCost + handlingCost + vatAmount;
  const netRevenue = grossRevenue;
  const profitSar = netRevenue - totalFees - costPrice;
  const profitPct = grossRevenue > 0 ? (profitSar / grossRevenue) * 100 : 0;

  return {
    grossRevenue: roundMoney(grossRevenue),
    vatAmount: roundMoney(vatAmount),
    commissionFee: roundMoney(commissionFee),
    serviceFee: roundMoney(serviceFee),
    shippingCost: roundMoney(shippingCost),
    handlingCost: roundMoney(handlingCost),
    totalFees: roundMoney(totalFees),
    netRevenue: roundMoney(netRevenue),
    profitSar: roundMoney(profitSar),
    profitPct: roundMoney(profitPct)
  };
}

export function breakEvenPrice(settings: EffectiveProductSettings): number {
  let baseFloor: number;
  try {
    baseFloor = baseNoLossFloor(settings);
  } catch {
    return Number.POSITIVE_INFINITY;
  }

  if (settings.minProfitType === "PERCENT") {
    const minProfitRate = settings.minProfitValue / 100;
    const denominator = 1 - minProfitRate;
    if (denominator <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    return ceilMoney(baseFloor / denominator);
  }

  return ceilMoney(baseFloor + settings.minProfitValue);
}

export function enforcedFloorPrice(settings: EffectiveProductSettings, minPrice = 0): number {
  const noLossFloor = breakEvenPrice(settings);
  if (!Number.isFinite(noLossFloor)) {
    return noLossFloor;
  }

  return ceilMoney(Math.max(noLossFloor, Math.max(0, minPrice)));
}

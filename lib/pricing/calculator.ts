import type { EffectiveProductSettings, PriceComputationResult } from "@/lib/pricing/types";
import { roundMoney } from "@/lib/utils/money";

export function computeFees(price: number, settings: EffectiveProductSettings): PriceComputationResult {
  const grossRevenue = Math.max(0, price);
  const commissionFee = grossRevenue * settings.commissionRate;

  const serviceFee =
    settings.serviceFeeType === "PERCENT"
      ? grossRevenue * settings.serviceFeeValue
      : settings.serviceFeeValue;

  const shippingCost = settings.shippingCost;
  const handlingCost = settings.handlingCost;

  const vatRateFactor = settings.vatRate > 0 ? settings.vatRate / 100 : 0;
  const vatAmount =
    settings.vatMode === "INCLUSIVE"
      ? grossRevenue - grossRevenue / (1 + vatRateFactor)
      : grossRevenue * vatRateFactor;

  const netRevenue =
    settings.vatMode === "INCLUSIVE"
      ? grossRevenue - vatAmount
      : grossRevenue;

  const totalFees = commissionFee + serviceFee + shippingCost + handlingCost;
  const profitSar = netRevenue - totalFees - settings.costPrice;
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
  const targetProfitSar =
    settings.minProfitType === "SAR" ? settings.minProfitValue : 0;

  const fixedCosts = settings.costPrice + settings.shippingCost + settings.handlingCost;
  const variableRate =
    settings.commissionRate +
    (settings.serviceFeeType === "PERCENT" ? settings.serviceFeeValue : 0);

  const vatRateFactor = settings.vatRate > 0 ? settings.vatRate / 100 : 0;

  const netFactor = settings.vatMode === "INCLUSIVE" ? 1 / (1 + vatRateFactor) : 1;

  if (settings.minProfitType === "PERCENT") {
    const minProfitRate = settings.minProfitValue / 100;
    const denominator = netFactor - variableRate - minProfitRate;

    if (denominator <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    const fixedPortion = fixedCosts + (settings.serviceFeeType === "FIXED" ? settings.serviceFeeValue : 0);
    return roundMoney(fixedPortion / denominator);
  }

  const denominator = netFactor - variableRate;
  if (denominator <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const fixedPortion =
    fixedCosts + targetProfitSar + (settings.serviceFeeType === "FIXED" ? settings.serviceFeeValue : 0);

  return roundMoney(fixedPortion / denominator);
}

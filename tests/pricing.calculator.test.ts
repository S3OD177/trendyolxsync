import { describe, expect, it } from "vitest";
import { breakEvenPrice, computeFees, enforcedFloorPrice } from "@/lib/pricing/calculator";
import type { EffectiveProductSettings } from "@/lib/pricing/types";

const baseSettings: EffectiveProductSettings = {
  costPrice: 50,
  feePercent: 0.1,
  commissionRate: 0.1,
  serviceFeeType: "PERCENT",
  serviceFeeValue: 0.02,
  shippingCost: 5,
  handlingCost: 2,
  vatRate: 15,
  vatMode: "INCLUSIVE",
  minProfitType: "SAR",
  minProfitValue: 0,
  undercutStep: 0.5,
  alertThresholdSar: 2,
  alertThresholdPct: 1,
  cooldownMinutes: 15,
  competitorDropPct: 3
};

describe("computeFees", () => {
  it("computes profit using fixed VAT on cost and percentage fee on cost", () => {
    const result = computeFees(120, baseSettings);
    expect(result.grossRevenue).toBe(120);
    expect(result.vatAmount).toBe(7.5);
    expect(result.commissionFee).toBe(5);
    expect(result.totalFees).toBe(17.5);
    expect(result.profitSar).toBeTypeOf("number");
  });
});

describe("breakEvenPrice", () => {
  it("computes the no-loss floor from cost + VAT + shipping + fee", () => {
    const value = breakEvenPrice({
      ...baseSettings,
      costPrice: 100,
      feePercent: 10,
      commissionRate: 10,
      shippingCost: 20,
      minProfitType: "SAR",
      minProfitValue: 0
    });

    expect(value).toBe(145);
  });

  it("returns finite break-even for SAR min-profit", () => {
    const value = breakEvenPrice(baseSettings);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  it("supports percent min-profit", () => {
    const value = breakEvenPrice({
      ...baseSettings,
      minProfitType: "PERCENT",
      minProfitValue: 5
    });

    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  it("normalizes fee input whether decimal or percent points", () => {
    const decimalRate = breakEvenPrice({
      ...baseSettings,
      costPrice: 100,
      feePercent: 0.1,
      commissionRate: 0.1,
      shippingCost: 20,
      minProfitType: "SAR",
      minProfitValue: 0
    });

    const percentRate = breakEvenPrice({
      ...baseSettings,
      costPrice: 100,
      feePercent: 10,
      commissionRate: 10,
      shippingCost: 20,
      minProfitType: "SAR",
      minProfitValue: 0
    });

    expect(decimalRate).toBe(145);
    expect(percentRate).toBe(145);
  });

  it("applies minPrice as a higher enforced floor", () => {
    const floor = enforcedFloorPrice(baseSettings, 90.11);
    expect(floor).toBe(90.11);
  });
});

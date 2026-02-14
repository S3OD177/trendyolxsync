import { describe, expect, it } from "vitest";
import { breakEvenPrice, computeFees } from "@/lib/pricing/calculator";
import type { EffectiveProductSettings } from "@/lib/pricing/types";

const baseSettings: EffectiveProductSettings = {
  costPrice: 50,
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
  it("computes net profit for VAT inclusive price", () => {
    const result = computeFees(120, baseSettings);
    expect(result.grossRevenue).toBe(120);
    expect(result.totalFees).toBeGreaterThan(0);
    expect(result.profitSar).toBeTypeOf("number");
  });
});

describe("breakEvenPrice", () => {
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
});

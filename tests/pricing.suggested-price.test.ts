import { describe, expect, it } from "vitest";
import { suggestedPrice } from "@/lib/pricing/suggested-price";
import type { EffectiveProductSettings } from "@/lib/pricing/types";

const settings: EffectiveProductSettings = {
  costPrice: 40,
  commissionRate: 0.1,
  serviceFeeType: "PERCENT",
  serviceFeeValue: 0.02,
  shippingCost: 3,
  handlingCost: 2,
  vatRate: 15,
  vatMode: "INCLUSIVE",
  minProfitType: "SAR",
  minProfitValue: 0,
  undercutStep: 1,
  alertThresholdSar: 2,
  alertThresholdPct: 1,
  cooldownMinutes: 15,
  competitorDropPct: 3
};

describe("suggestedPrice", () => {
  it("returns null when competitor data is absent", () => {
    const result = suggestedPrice({ competitorMin: null, ourPrice: 100, settings });
    expect(result.suggested).toBeNull();
  });

  it("never suggests below floor", () => {
    const result = suggestedPrice({ competitorMin: 10, ourPrice: 100, settings });
    expect(result.suggested).toBeGreaterThan(10);
  });

  it("honors cooldown for downward changes", () => {
    const now = new Date();
    const result = suggestedPrice({
      competitorMin: 80,
      ourPrice: 100,
      settings,
      lastDownwardChangeAt: new Date(now.getTime() - 5 * 60 * 1000),
      now
    });

    expect(result.reason).toBe("COOLDOWN_ACTIVE");
    expect(result.suggested).toBe(100);
  });
});

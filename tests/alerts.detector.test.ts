import { describe, expect, it } from "vitest";
import { detectAlerts } from "@/lib/alerts/detector";
import type { EffectiveProductSettings } from "@/lib/pricing/types";

const settings: EffectiveProductSettings = {
  costPrice: 40,
  feePercent: 0.1,
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

describe("detectAlerts", () => {
  it("emits LOSE buybox alert", () => {
    const alerts = detectAlerts({
      productId: "p1",
      sku: "SKU-1",
      ourPrice: 100,
      competitorMin: 90,
      previousCompetitorMin: 95,
      buyboxStatus: "LOSE",
      breakEvenPrice: 70,
      suggestedPrice: 89,
      settings
    });

    expect(alerts.some((a) => a.type === "LOST_BUYBOX")).toBe(true);
  });

  it("emits PRICE_WAR when competitor is below break-even", () => {
    const alerts = detectAlerts({
      productId: "p1",
      sku: "SKU-1",
      ourPrice: 100,
      competitorMin: 50,
      previousCompetitorMin: 80,
      buyboxStatus: "LOSE",
      breakEvenPrice: 70,
      suggestedPrice: 70,
      settings
    });

    expect(alerts.some((a) => a.type === "PRICE_WAR")).toBe(true);
  });
});

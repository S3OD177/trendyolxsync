import type { AlertSeverity, AlertType } from "@prisma/client";
import type { EffectiveProductSettings } from "@/lib/pricing/types";

export interface AlertCandidate {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  metadata: Record<string, unknown>;
}

export interface AlertDetectionInput {
  productId: string;
  sku: string;
  ourPrice: number | null;
  competitorMin: number | null;
  previousCompetitorMin: number | null;
  buyboxStatus: "WIN" | "LOSE" | "UNKNOWN";
  breakEvenPrice: number;
  suggestedPrice: number | null;
  settings: EffectiveProductSettings;
}

export function detectAlerts(input: AlertDetectionInput): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];

  if (input.buyboxStatus === "LOSE") {
    alerts.push({
      type: "LOST_BUYBOX",
      severity: "WARN",
      message: `Lost BuyBox for SKU ${input.sku}`,
      metadata: {
        ourPrice: input.ourPrice,
        competitorMin: input.competitorMin
      }
    });
  }

  if (input.competitorMin !== null && input.ourPrice !== null) {
    const delta = input.ourPrice - input.competitorMin;
    const deltaPct = input.ourPrice > 0 ? (delta / input.ourPrice) * 100 : 0;

    if (delta > input.settings.alertThresholdSar || deltaPct > input.settings.alertThresholdPct) {
      alerts.push({
        type: "NOT_COMPETITIVE",
        severity: "WARN",
        message: `SKU ${input.sku} is not competitive by ${delta.toFixed(2)} SAR (${deltaPct.toFixed(2)}%)`,
        metadata: { delta, deltaPct }
      });
    }
  }

  if (input.previousCompetitorMin !== null && input.competitorMin !== null) {
    const drop = input.previousCompetitorMin - input.competitorMin;
    const dropPct =
      input.previousCompetitorMin > 0 ? (drop / input.previousCompetitorMin) * 100 : 0;

    if (dropPct >= input.settings.competitorDropPct) {
      alerts.push({
        type: "COMPETITOR_DROP",
        severity: "INFO",
        message: `Competitor price dropped ${dropPct.toFixed(2)}% for SKU ${input.sku}`,
        metadata: { drop, dropPct }
      });
    }
  }

  if (
    input.suggestedPrice !== null &&
    input.ourPrice !== null &&
    input.suggestedPrice < input.ourPrice &&
    input.suggestedPrice >= input.breakEvenPrice
  ) {
    alerts.push({
      type: "SAFE_REPRICE",
      severity: "INFO",
      message: `Safe reprice available for SKU ${input.sku}`,
      metadata: {
        currentPrice: input.ourPrice,
        suggestedPrice: input.suggestedPrice
      }
    });
  }

  if (input.competitorMin !== null && input.competitorMin < input.breakEvenPrice) {
    alerts.push({
      type: "PRICE_WAR",
      severity: "CRITICAL",
      message: `Price war risk: competitor below break-even for SKU ${input.sku}`,
      metadata: {
        competitorMin: input.competitorMin,
        breakEvenPrice: input.breakEvenPrice
      }
    });
  }

  return alerts;
}

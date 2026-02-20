import { enforcedFloorPrice } from "@/lib/pricing/calculator";
import type { SuggestedPriceArgs, SuggestedPriceResult } from "@/lib/pricing/types";
import { roundMoney } from "@/lib/utils/money";

export function suggestedPrice(args: SuggestedPriceArgs): SuggestedPriceResult {
  const { competitorMin, settings, minPrice, lastDownwardChangeAt, now = new Date(), bypassCooldown } = args;
  const floor = enforcedFloorPrice(settings, minPrice ?? 0);

  if (!Number.isFinite(floor)) {
    return {
      suggested: null,
      floor,
      target: competitorMin === null || competitorMin === undefined ? null : competitorMin,
      reason: "FLOOR_INVALID"
    };
  }

  if (competitorMin === null || competitorMin === undefined) {
    return {
      suggested: null,
      floor,
      target: null,
      reason: "NO_COMPETITOR_DATA"
    };
  }

  const target = roundMoney(Math.max(0, competitorMin - settings.undercutStep));
  const computed = roundMoney(Math.max(floor, target));

  const cooldownMs = settings.cooldownMinutes * 60 * 1000;
  const cooldownActive =
    !bypassCooldown &&
    !!lastDownwardChangeAt &&
    now.getTime() - lastDownwardChangeAt.getTime() < cooldownMs;

  if (cooldownActive && args.ourPrice !== null && computed < args.ourPrice) {
    return {
      suggested: args.ourPrice,
      floor,
      target,
      reason: "COOLDOWN_ACTIVE"
    };
  }

  if (args.ourPrice !== null && computed === args.ourPrice) {
    return {
      suggested: computed,
      floor,
      target,
      reason: "NO_CHANGE"
    };
  }

  return {
    suggested: computed,
    floor,
    target,
    reason: computed === floor ? "FLOOR_PROTECTED" : "ABOVE_FLOOR"
  };
}

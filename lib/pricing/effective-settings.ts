import type {
  GlobalSettings,
  MinProfitType,
  ProductSettings,
  ServiceFeeType,
  VatMode
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { EffectiveProductSettings } from "@/lib/pricing/types";

export const decimalToNumber = (value: unknown, fallback = 0) =>
  value === null || value === undefined ? fallback : Number(value);

export function mergeSettings(
  globalSettings: GlobalSettings,
  productSettings: ProductSettings
): EffectiveProductSettings {
  return {
    costPrice: decimalToNumber(productSettings.costPrice),
    commissionRate: decimalToNumber(productSettings.commissionRate, decimalToNumber(globalSettings.commissionRate)),
    serviceFeeType:
      (productSettings.serviceFeeType as ServiceFeeType | null) ?? globalSettings.serviceFeeType,
    serviceFeeValue: decimalToNumber(productSettings.serviceFeeValue, decimalToNumber(globalSettings.serviceFeeValue)),
    shippingCost: decimalToNumber(productSettings.shippingCost, decimalToNumber(globalSettings.shippingCost)),
    handlingCost: decimalToNumber(productSettings.handlingCost, decimalToNumber(globalSettings.handlingCost)),
    vatRate: decimalToNumber(productSettings.vatRate, decimalToNumber(globalSettings.vatRate)),
    vatMode: (productSettings.vatMode as VatMode | null) ?? globalSettings.vatMode,
    minProfitType:
      (productSettings.minProfitType as MinProfitType | null) ?? globalSettings.minProfitType,
    minProfitValue: decimalToNumber(productSettings.minProfitValue, decimalToNumber(globalSettings.minProfitValue)),
    undercutStep: decimalToNumber(productSettings.undercutStep, decimalToNumber(globalSettings.undercutStep)),
    alertThresholdSar: decimalToNumber(
      productSettings.alertThresholdSar,
      decimalToNumber(globalSettings.alertThresholdSar)
    ),
    alertThresholdPct: decimalToNumber(
      productSettings.alertThresholdPct,
      decimalToNumber(globalSettings.alertThresholdPct)
    ),
    cooldownMinutes: productSettings.cooldownMinutes ?? globalSettings.cooldownMinutes,
    competitorDropPct: decimalToNumber(
      productSettings.competitorDropPct,
      decimalToNumber(globalSettings.competitorDropPct)
    )
  };
}

export async function getOrCreateGlobalSettings() {
  const existing = await prisma.globalSettings.findFirst();
  if (existing) {
    return existing;
  }

  return prisma.globalSettings.create({
    data: {
      currency: "SAR"
    }
  });
}

export async function getOrCreateProductSettings(productId: string) {
  const settings = await prisma.productSettings.findUnique({ where: { productId } });
  if (settings) {
    return settings;
  }

  return prisma.productSettings.create({
    data: {
      productId,
      costPrice: 0
    }
  });
}

export async function getEffectiveSettingsForProduct(productId: string): Promise<EffectiveProductSettings> {
  const [globalSettings, productSettings] = await Promise.all([
    getOrCreateGlobalSettings(),
    getOrCreateProductSettings(productId)
  ]);

  return mergeSettings(globalSettings, productSettings);
}

import { prisma } from "@/lib/db/prisma";
import { trendyolClient } from "@/lib/trendyol/client";
import { computeFees, enforcedFloorPrice } from "@/lib/pricing/calculator";
import { getEffectiveSettingsForProduct } from "@/lib/pricing/effective-settings";
import { suggestedPrice } from "@/lib/pricing/suggested-price";
import { refreshSnapshotForProduct } from "@/lib/jobs/poll-products";
import { Prisma } from "@prisma/client";

export async function runAutoPilot() {
    // 1. Fetch all products with Auto-Pilot ENABLED
    const products = await prisma.product.findMany({
        where: {
            active: true,
            settings: {
                autoPilot: true
            }
        },
        include: {
            settings: true,
            snapshots: {
                orderBy: { checkedAt: "desc" },
                take: 1
            },
            priceChanges: {
                orderBy: { createdAt: "desc" },
                take: 1
            }
        }
    });

    console.log(`[AutoPilot] Found ${products.length} active products with Auto-Pilot enabled.`);

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const product of products) {
        try {
            processed++;
            const { settings } = product;

            // SAFETY CHECK 1: Cost Price is REQUIRED
            if (!settings?.costPrice || Number(settings.costPrice) <= 0) {
                console.warn(`[AutoPilot] Skipping ${product.sku}: Missing Cost Price.`);
                skipped++;
                continue;
            }

            const latestSnapshot = product.snapshots[0];
            if (!latestSnapshot) {
                skipped++;
                continue;
            }

            // Calculate Suggestion
            // logic similar to suggested-price.ts but we might need to respect the 'strategy' enum
            // For now, we default to "MATCH" behavior which is what suggestedPrice does by default (undercutting)
            // Todo: Implement specific logic for BEAT_BY_1 vs BEAT_BY_5 if needed, 
            // but suggestedPrice function usually handles the "undercutStep" from settings.

            const ourPrice =
                latestSnapshot.ourPrice !== null ? Number(latestSnapshot.ourPrice) : null;
            const competitorMin =
                latestSnapshot.competitorMinPrice !== null
                    ? Number(latestSnapshot.competitorMinPrice)
                    : null;

            const effectiveSettings = await getEffectiveSettingsForProduct(product.id);

            const computed = suggestedPrice({
                competitorMin,
                ourPrice,
                settings: effectiveSettings,
                minPrice: settings?.minPrice ? Number(settings.minPrice) : 0,
                lastDownwardChangeAt: product.priceChanges[0]?.createdAt ?? null,
                bypassCooldown: false // Auto-pilot should respect cooldowns!
            });

            if (!computed.suggested) {
                // No suggestion (maybe already winning, or cooldown active)
                skipped++;
                continue;
            }

            const newPrice = computed.suggested;

            // SAFETY CHECK 2: Profit Guard
            const feeResult = computeFees(newPrice, effectiveSettings);
            const minPriceFloor = settings.minPrice ? Number(settings.minPrice) : 0;
            const enforcedFloor = enforcedFloorPrice(effectiveSettings, minPriceFloor);

            // Check absolute floor override
            if (newPrice < enforcedFloor) {
                console.warn(`[AutoPilot] Skipping ${product.sku}: Price ${newPrice} below enforced floor ${enforcedFloor}.`);
                skipped++;
                continue;
            }

            // Check Profit (Cost + Fees)
            // If profit is negative, it means (Price - Fees - Cost) < 0  => Price < (Cost + Fees)
            if (feeResult.profitSar < 0) {
                console.warn(`[AutoPilot] Skipping ${product.sku}: Price ${newPrice} causes loss (Profit: ${feeResult.profitSar}).`);
                // Optionally: Create an Alert here?
                skipped++;
                continue;
            }

            // If we are here, it's safe to update.
            console.log(`[AutoPilot] Updating ${product.sku}: ${ourPrice} -> ${newPrice}`);

            if (!trendyolClient.isConfigured()) {
                throw new Error("Trendyol credentials missing");
            }

            const reference = product.barcode || product.sku;
            const response = await trendyolClient.updatePrice(reference, newPrice);

            await prisma.priceChangeLog.create({
                data: {
                    productId: product.id,
                    oldPrice: ourPrice,
                    newPrice: newPrice,
                    method: "SUGGESTED", // or a new enum AutoPilot
                    trendyolResponseJson: response.raw as Prisma.InputJsonValue
                }
            });

            await refreshSnapshotForProduct(product);
            updated++;

        } catch (error) {
            console.error(`[AutoPilot] Error processing ${product.sku}:`, error);
            errors++;
        }
    }

    return { processed, updated, skipped, errors };
}

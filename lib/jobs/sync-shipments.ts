import { prisma } from "@/lib/db/prisma";
import { trendyolClient } from "@/lib/trendyol/client";
import type { Prisma } from "@prisma/client";

export async function syncShipmentsJob(
    options: {
        lookbackHours?: number;
        forceFull?: boolean;
        maxPages?: number;
    } = {}
) {
    if (!trendyolClient.isConfigured()) {
        throw new Error("Trendyol client not configured");
    }

    const lookbackHours = options.lookbackHours ?? 24;
    const maxPages = options.maxPages ?? 20;

    // Calculate start/end dates
    const now = Date.now();
    const startDate = options.forceFull
        ? now - (1000 * 60 * 60 * 24 * 30) // 30 days if full
        : now - (1000 * 60 * 60 * lookbackHours);

    let page = 0;
    let totalSynced = 0;

    console.log(`Starting shipment sync. Start=${new Date(startDate).toISOString()}, MaxPages=${maxPages}`);

    while (page < maxPages) {
        const result = await trendyolClient.fetchShipmentPackages({
            page,
            size: 50,
            startDate,
            endDate: now,
            orderByField: "PackageLastModifiedDate",
            orderByDirection: "DESC"
        });

        if (!result.content.length) {
            break;
        }

        const sellerId = BigInt(trendyolClient.getSellerId());

        for (const pkg of result.content) {
            const lastModifiedAt = pkg.packageLastModifiedDate ? new Date(pkg.packageLastModifiedDate) : null;
            const createdAt = pkg.shipmentPackageCreationDate ? new Date(pkg.shipmentPackageCreationDate) : null;
            const deliveryStart = pkg.estimatedDeliveryStartDate ? new Date(pkg.estimatedDeliveryStartDate) : null;
            const deliveryEnd = pkg.estimatedDeliveryEndDate ? new Date(pkg.estimatedDeliveryEndDate) : null;

            await prisma.shipmentPackage.upsert({
                where: {
                    sellerId_packageNumber: {
                        sellerId,
                        packageNumber: String(pkg.packageNumber)
                    }
                },
                create: {
                    sellerId,
                    packageNumber: String(pkg.packageNumber),
                    orderNumber: pkg.orderNumber,
                    status: pkg.shipmentPackageStatus,
                    cargoProvider: pkg.cargoProviderName,
                    trackingNumber: pkg.cargoTrackingNumber ? String(pkg.cargoTrackingNumber) : null,
                    trackingLink: pkg.cargoTrackingLink,
                    lastModifiedAt,
                    createdAt,
                    estimatedDeliveryStart: deliveryStart,
                    estimatedDeliveryEnd: deliveryEnd,
                    linesCount: pkg.lines?.length ?? 0,
                    rawPayload: pkg as unknown as Prisma.InputJsonValue
                },
                update: {
                    status: pkg.shipmentPackageStatus,
                    cargoProvider: pkg.cargoProviderName,
                    trackingNumber: pkg.cargoTrackingNumber ? String(pkg.cargoTrackingNumber) : null,
                    trackingLink: pkg.cargoTrackingLink,
                    lastModifiedAt,
                    estimatedDeliveryStart: deliveryStart,
                    estimatedDeliveryEnd: deliveryEnd,
                    linesCount: pkg.lines?.length ?? 0,
                    rawPayload: pkg as unknown as Prisma.InputJsonValue,
                    syncedAt: new Date()
                }
            });

            totalSynced++;
        }

        page++;

        if (page >= result.totalPages) {
            break;
        }
    }

    return { totalSynced, pagesFetched: page };
}

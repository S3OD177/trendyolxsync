
import { prisma as db } from "@/lib/db/prisma";
import { trendyolClient } from "@/lib/trendyol/client";
import { Prisma } from "@prisma/client";

export class OrderService {
    async syncOrders(daysToLookBack = 365) {
        const endDate = Date.now();
        const startDate = endDate - daysToLookBack * 24 * 60 * 60 * 1000;

        console.log(`[OrderService] Syncing orders from ${new Date(startDate).toISOString()} to ${new Date(endDate).toISOString()}`);

        let page = 0;
        let totalSynced = 0;
        const size = 50;

        while (true) {
            const { content, totalPages } = await trendyolClient.fetchShipmentPackages({
                page,
                size,
                startDate,
                endDate,
                orderByField: "PackageLastModifiedDate",
                orderByDirection: "DESC",
            });

            if (!content || content.length === 0) {
                break;
            }

            console.log(`[OrderService] Processing page ${page + 1}/${totalPages}, found ${content.length} packages`);

            for (const pkg of content) {
                await this.upsertOrder(pkg);
                totalSynced++;
            }

            page++;
            if (page >= totalPages) {
                break;
            }
        }

        return { totalSynced };
    }

    private async upsertOrder(pkg: any) {
        // pkg is TrendyolShipmentPackage but we treat as any to access extra fields safely

        // Extract customer info
        const firstName = pkg.customerFirstName || pkg.shipmentAddress?.firstName || "";
        const lastName = pkg.customerLastName || pkg.shipmentAddress?.lastName || "";
        const email = pkg.customerEmail || pkg.shipmentAddress?.email || "";

        // Extract status
        // Map Trendyol status to our status if needed, or just store as is.

        // Prepare Order data
        const orderData: Prisma.OrderCreateInput = {
            orderNumber: pkg.orderNumber || pkg.packageNumber, // Fallback
            sellerId: BigInt(trendyolClient.getSellerId() || 0),
            status: pkg.status,
            totalPrice: pkg.totalPrice,
            currency: pkg.currencyCode || "SAR",
            customerFirstName: firstName,
            customerLastName: lastName,
            customerEmail: email,
            createdDate: new Date(pkg.orderDate || pkg.shipmentPackageCreationDate),
            estimatedDeliveryStart: pkg.estimatedDeliveryStartDate ? new Date(pkg.estimatedDeliveryStartDate) : null,
            estimatedDeliveryEnd: pkg.estimatedDeliveryEndDate ? new Date(pkg.estimatedDeliveryEndDate) : null,
            shipmentPackageId: String(pkg.id),
        };

        // Upsert Order
        const order = await db.order.upsert({
            where: { orderNumber: orderData.orderNumber },
            update: {
                status: orderData.status,
                updatedAt: new Date(),
                // Update other fields if they changed? 
                // Typically status and delivery dates change.
                estimatedDeliveryStart: orderData.estimatedDeliveryStart,
                estimatedDeliveryEnd: orderData.estimatedDeliveryEnd,
            },
            create: orderData,
        });

        // Handle Order Items
        // We wipe existing items and recreate them to handle updates simply, 
        // or upsert them. Recreating is safer for "lines" array changes.
        // But deleting might break other relations if we had them. 
        // For now, let's delete and create.

        await db.orderItem.deleteMany({
            where: { orderId: order.id },
        });

        for (const line of (pkg.lines || [])) {
            await db.orderItem.create({
                data: {
                    orderId: order.id,
                    sku: line.sku || line.barcode || "UNKNOWN",
                    productName: line.productName,
                    quantity: line.quantity,
                    price: line.price,
                    vatBaseAmount: line.vatBaseAmount,
                    merchantSku: line.merchantSku,
                    currency: line.currencyCode || "SAR",
                    barcode: line.barcode
                },
            });
        }
    }
}

export const orderService = new OrderService();

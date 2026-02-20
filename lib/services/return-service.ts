
import { prisma as db } from "@/lib/db/prisma";
import { trendyolClient } from "@/lib/trendyol/client";
import { Prisma } from "@prisma/client";

export class ReturnService {
    async syncReturns(daysToLookBack = 365) {
        const endDate = Date.now();
        const startDate = endDate - daysToLookBack * 24 * 60 * 60 * 1000;

        console.log(`[ReturnService] Syncing returns (via Returned Orders) from ${new Date(startDate).toISOString()}`);

        let page = 0;
        let totalSynced = 0;
        const size = 50;

        while (true) {
            // Fallback: Fetch "Returned" orders since /claims endpoint is 556 Service Unavailable
            const { content, totalPages } = await trendyolClient.fetchShipmentPackages({
                page,
                size,
                startDate,
                endDate,
                status: "Returned"
            });

            if (!content || content.length === 0) {
                break;
            }

            for (const order of content) {
                await this.upsertReturnFromOrder(order);
                totalSynced++;
            }

            page++;
            if (page >= totalPages) {
                break;
            }
        }

        return { totalSynced };
    }

    private async upsertReturnFromOrder(order: any) {
        // Map Order to ReturnRequest Structure
        // distinct using shipmentPackageId as claimId fallback
        const claimId = String(order.shipmentPackageId);

        const returnData: Prisma.ReturnRequestCreateInput = {
            claimId: claimId,
            orderNumber: order.orderNumber,
            dateTime: new Date(order.lastModifiedDate || order.orderDate),
            reason: "Return (Order Status)", // Generic reason as we don't have claim details
            status: order.status,
            returnStatus: "Completed",
            customerFirstName: order.customerFirstName,
            customerLastName: order.customerLastName,
        };

        const returnRequest = await db.returnRequest.upsert({
            where: { claimId: returnData.claimId },
            update: {
                status: returnData.status,
                updatedAt: new Date(),
            },
            create: returnData,
        });

        // Handle Items
        await db.returnItem.deleteMany({
            where: { returnRequestId: returnRequest.id },
        });

        if (order.lines) {
            for (const line of order.lines) {
                await db.returnItem.create({
                    data: {
                        returnRequestId: returnRequest.id,
                        sku: line.sku || line.merchantSku || "UNKNOWN",
                        quantity: line.quantity || 1,
                        reason: "Returned",
                    },
                });
            }
        }
    }
}

export const returnService = new ReturnService();

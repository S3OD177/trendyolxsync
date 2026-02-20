
import { describe, it, expect, vi, beforeEach } from "vitest";
import { orderService } from "@/lib/services/order-service";
import { returnService } from "@/lib/services/return-service";
import { trendyolClient } from "@/lib/trendyol/client";
import { prisma } from "@/lib/db/prisma";

// Mock dependencies
vi.mock("@/lib/trendyol/client", () => ({
    trendyolClient: {
        fetchShipmentPackages: vi.fn(),
        fetchClaims: vi.fn(),
        getSellerId: vi.fn().mockReturnValue("1001"),
    },
}));

vi.mock("@/lib/db/prisma", () => ({
    prisma: {
        order: {
            upsert: vi.fn().mockResolvedValue({ id: "order-123" }),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
        },
        orderItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockResolvedValue({ id: "item-123" }),
            groupBy: vi.fn().mockResolvedValue([]),
        },
        returnRequest: {
            upsert: vi.fn().mockResolvedValue({ id: "return-123" }),
            findMany: vi.fn().mockResolvedValue([]),
        },
        returnItem: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockResolvedValue({ id: "ritem-123" }),
        },
        product: {
            findUnique: vi.fn().mockResolvedValue({ id: "prod-1", sku: "SKU1" }),
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
        },
        priceSnapshot: {
            findMany: vi.fn().mockResolvedValue([]),
        }
    },
}));

describe("OrderService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should sync orders correctly", async () => {
        // Mock Trendyol response
        const mockPackages = {
            content: [
                {
                    id: 101,
                    orderNumber: "ORD-001",
                    status: "Shipped",
                    totalPrice: 150.0,
                    currencyCode: "SAR",
                    customerFirstName: "John",
                    customerLastName: "Doe",
                    customerEmail: "john@example.com",
                    orderDate: 1672531200000,
                    lines: [
                        {
                            quantity: 1,
                            merchantSku: "SKU1",
                            amount: 100.0,
                            vatBaseAmount: 10.0,
                            currencyCode: "SAR",
                        },
                    ],
                },
            ],
            totalPages: 1,
        };

        vi.mocked(trendyolClient.fetchShipmentPackages).mockResolvedValue(mockPackages as any);

        const result = await orderService.syncOrders(1);

        expect(trendyolClient.fetchShipmentPackages).toHaveBeenCalled();
        expect(prisma.order.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { orderNumber: "ORD-001" },
                create: expect.objectContaining({
                    orderNumber: "ORD-001",
                    totalPrice: 150.0
                })
            })
        );
        expect(result.totalSynced).toBe(1);
    });

    it("should handle empty response gracefully", async () => {
        vi.mocked(trendyolClient.fetchShipmentPackages).mockResolvedValue({ content: [], totalPages: 0 });
        const result = await orderService.syncOrders(1);
        expect(result.totalSynced).toBe(0);
    });
});

describe("ReturnService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should sync returns correctly", async () => {
        const mockReturnedPackages = {
            content: [
                {
                    shipmentPackageId: 202,
                    orderNumber: "ORD-001",
                    status: "Returned",
                    orderDate: 1672617600000,
                    customerFirstName: "Jane",
                    customerLastName: "Doe",
                    lines: [
                        { merchantSku: "SKU2", quantity: 1 }
                    ]
                }
            ],
            totalPages: 1
        };

        vi.mocked(trendyolClient.fetchShipmentPackages).mockResolvedValue(mockReturnedPackages as any);

        const result = await returnService.syncReturns(1);

        expect(trendyolClient.fetchShipmentPackages).toHaveBeenCalled();
        expect(prisma.returnRequest.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { claimId: "202" },
                create: expect.objectContaining({
                    claimId: "202",
                    status: "Returned"
                })
            })
        );
        expect(result.totalSynced).toBe(1);
    });
});

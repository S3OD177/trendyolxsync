
import { OrdersClient } from "@/components/orders/orders-client";
import { prisma as db } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
    const orders = await db.order.findMany({
        orderBy: { createdDate: "desc" },
        include: { items: true },
        // No limit, fetch all
    });

    return <OrdersClient initialOrders={orders as any[]} />;
}

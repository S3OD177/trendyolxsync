
import { prisma as db } from "@/lib/db/prisma";
import { ReturnsClient } from "@/components/returns/returns-client";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
    const returns = await db.returnRequest.findMany({
        orderBy: { dateTime: "desc" },
        include: { items: true },
        // No limit
    });

    return <ReturnsClient initialReturns={returns as any[]} />;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const logs = await prisma.competitorLog.findMany({
            where: {
                productId: params.id,
            },
            orderBy: {
                checkedAt: "asc",
            },
            take: 100, // Limit to last 100 data points for chart performance
        });

        return NextResponse.json({ logs });
    } catch (error) {
        console.error("Failed to fetch competitor logs:", error);
        return NextResponse.json(
            { error: "Failed to fetch competitor logs" },
            { status: 500 }
        );
    }
}

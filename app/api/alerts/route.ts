import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const alerts = await prisma.alert.findMany({
      include: {
        product: {
          select: {
            sku: true,
            title: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });

    return NextResponse.json({ alerts }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `${error.message}. Run Prisma migrations on production database.`
            : "Failed to fetch alerts"
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { formatApiError, isDatabaseUnavailableError } from "@/lib/db/errors";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";

export const dynamic = "force-dynamic";

export async function GET() {
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
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        {
          alerts: [],
          warning:
            "Database is unreachable. Alerts are temporarily unavailable until DATABASE_URL connectivity is restored."
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        error: formatApiError(error, "Failed to fetch alerts")
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

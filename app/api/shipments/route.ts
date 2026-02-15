import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { formatApiError, isDatabaseUnavailableError } from "@/lib/db/errors";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { PIN_COOKIE_NAME } from "@/lib/auth/pin";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const hasPinSession = request.cookies.get(PIN_COOKIE_NAME)?.value === "1";

    if (!hasPinSession) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "50")));
    const offset = (page - 1) * limit;

    try {
        const where: Prisma.ShipmentPackageWhereInput = {};

        if (search) {
            where.OR = [
                { packageNumber: { contains: search, mode: "insensitive" } },
                { orderNumber: { contains: search, mode: "insensitive" } },
                { trackingNumber: { contains: search, mode: "insensitive" } }
            ];
        }

        if (status) {
            where.status = status;
        }

        const [rows, total] = await Promise.all([
            prisma.shipmentPackage.findMany({
                where,
                orderBy: { lastModifiedAt: "desc" },
                take: limit,
                skip: offset
            }),
            prisma.shipmentPackage.count({ where })
        ]);

        return NextResponse.json({
            rows,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        }, { headers: NO_STORE_HEADERS });

    } catch (error) {
        if (isDatabaseUnavailableError(error)) {
            return NextResponse.json(
                { rows: [], meta: { total: 0, page, limit, totalPages: 0 }, warning: "Database is unreachable." },
                { headers: NO_STORE_HEADERS }
            );
        }

        return NextResponse.json(
            { error: formatApiError(error, "Failed to fetch shipments") },
            { status: 500, headers: NO_STORE_HEADERS }
        );
    }
}

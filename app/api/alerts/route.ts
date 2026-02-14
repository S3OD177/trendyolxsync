import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
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

  return NextResponse.json({ alerts });
}

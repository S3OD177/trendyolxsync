import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

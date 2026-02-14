import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  alertId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const alert = await prisma.alert.update({
    where: { id: parsed.data.alertId },
    data: { isRead: true }
  });

  return NextResponse.json({ ok: true, alert });
}

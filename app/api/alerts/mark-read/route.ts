import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  alertId: z.string().min(1).optional(),
  alertIds: z.array(z.string().min(1)).min(1).optional()
}).refine((value) => Boolean(value.alertId) || Boolean(value.alertIds?.length), {
  message: "Either alertId or alertIds is required"
});

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.alertId) {
    const alert = await prisma.alert.update({
      where: { id: parsed.data.alertId },
      data: { isRead: true }
    });

    return NextResponse.json({ ok: true, count: 1, alert });
  }

  const ids = Array.from(new Set(parsed.data.alertIds ?? []));
  const result = await prisma.alert.updateMany({
    where: {
      id: {
        in: ids
      }
    },
    data: { isRead: true }
  });

  return NextResponse.json({ ok: true, count: result.count, alertIds: ids });
}

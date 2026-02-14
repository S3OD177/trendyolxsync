import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/guards";
import {
  notifyAllChannels,
  sendEmailNotification,
  sendTelegramNotification
} from "@/lib/alerts/notifier";

const bodySchema = z.object({
  channel: z.enum(["email", "telegram", "all"]).default("all")
});

export async function POST(request: NextRequest) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const message = {
    title: "[TEST] Trendyol BuyBox Guard notification",
    body: `Test notification triggered by ${user.email} at ${new Date().toISOString()}`
  };

  if (parsed.data.channel === "email") {
    const result = await sendEmailNotification(message);
    return NextResponse.json({ ok: true, result });
  }

  if (parsed.data.channel === "telegram") {
    const result = await sendTelegramNotification(message);
    return NextResponse.json({ ok: true, result });
  }

  const result = await notifyAllChannels(message);
  return NextResponse.json({ ok: true, result });
}

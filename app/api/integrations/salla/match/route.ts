import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { NO_STORE_HEADERS } from "@/lib/http/no-store";
import { sallaClient } from "@/lib/salla/client";
import { matchPreview, runSingleSallaMatch } from "@/lib/salla/sync";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    productId: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    persist: z.boolean().default(true)
  })
  .refine((value) => Boolean(value.productId || value.sku || value.name), {
    message: "At least one of productId, sku, or name is required"
  });

export async function POST(request: NextRequest) {
  if (!(await sallaClient.hasCredential())) {
    return NextResponse.json(
      { error: "Salla is not connected. Connect via OAuth or set SALLA_ACCESS_TOKEN." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const result = await runSingleSallaMatch(parsed.data);

    return NextResponse.json(
      {
        ok: true,
        persisted: result.persisted,
        costWithoutTax: result.costWithoutTax,
        ...matchPreview(result.match)
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Salla match failed";
    const status = /required when persist=true/i.test(message) ? 422 : 502;

    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status, headers: NO_STORE_HEADERS }
    );
  }
}

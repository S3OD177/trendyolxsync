import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

const updateSchema = z.object({
  costPrice: z.number().min(0),
  commissionRate: z.number().min(0).max(1).nullable().optional(),
  serviceFeeType: z.enum(["FIXED", "PERCENT"]).nullable().optional(),
  serviceFeeValue: z.number().min(0).nullable().optional(),
  shippingCost: z.number().min(0).nullable().optional(),
  handlingCost: z.number().min(0).nullable().optional(),
  vatRate: z.number().min(0).max(100).nullable().optional(),
  vatMode: z.enum(["INCLUSIVE", "EXCLUSIVE"]).nullable().optional(),
  minProfitType: z.enum(["SAR", "PERCENT"]).nullable().optional(),
  minProfitValue: z.number().min(0).nullable().optional(),
  undercutStep: z.number().min(0).nullable().optional(),
  alertThresholdSar: z.number().min(0).nullable().optional(),
  alertThresholdPct: z.number().min(0).nullable().optional(),
  cooldownMinutes: z.number().int().min(1).nullable().optional(),
  competitorDropPct: z.number().min(0).nullable().optional()
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { settings: true }
  });

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({ settings: product.settings });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const exists = await prisma.product.findUnique({ where: { id: params.id } });

  if (!exists) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const settings = await prisma.productSettings.upsert({
    where: { productId: params.id },
    update: parsed.data,
    create: {
      productId: params.id,
      ...parsed.data,
      costPrice: parsed.data.costPrice
    }
  });

  return NextResponse.json({ ok: true, settings });
}

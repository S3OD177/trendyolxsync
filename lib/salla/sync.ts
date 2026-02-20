import { env } from "@/lib/config/env";
import { prisma } from "@/lib/db/prisma";
import { matchSallaProduct } from "@/lib/salla/matcher";
import type {
  SallaBatchSyncOptions,
  SallaBatchSyncSummary,
  SallaCostSource,
  SallaMatchMethod,
  SallaMatchOutcome,
  SallaProductRecord
} from "@/lib/salla/types";

const CHUNK_SIZE = 20;

export function selectCostWithoutTax(
  product: SallaProductRecord,
  source: SallaCostSource = env.SALLA_COST_SOURCE
) {
  if (source === "COST_PRICE") {
    return product.costPrice ?? product.preTaxPrice ?? null;
  }

  return product.preTaxPrice ?? product.costPrice ?? null;
}

export async function persistSallaMatch(input: {
  productId: string;
  matchMethod: SallaMatchMethod;
  matchScore: number;
  sallaProduct: SallaProductRecord;
}) {
  const costWithoutTax = selectCostWithoutTax(input.sallaProduct);

  if (costWithoutTax !== null) {
    await prisma.productSettings.upsert({
      where: { productId: input.productId },
      update: { costPrice: costWithoutTax },
      create: {
        productId: input.productId,
        costPrice: costWithoutTax
      }
    });
  }

  return {
    costWithoutTax,
    quantity: input.sallaProduct.quantity,
    preTaxPrice: input.sallaProduct.preTaxPrice,
    costPrice: input.sallaProduct.costPrice,
    method: input.matchMethod,
    score: input.matchScore
  };
}

export async function runSallaBatchSync(options: SallaBatchSyncOptions = {}): Promise<SallaBatchSyncSummary> {
  const activeOnly = options.activeOnly ?? true;
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  const dryRun = options.dryRun ?? false;
  const persist = options.persist ?? true;
  const shouldPersist = persist && !dryRun;

  const products = await prisma.product.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: { updatedAt: "desc" },
    skip: offset,
    take: limit,
    select: {
      id: true,
      sku: true,
      title: true
    }
  });

  const summary: SallaBatchSyncSummary = {
    ok: true,
    total: products.length,
    processed: 0,
    matched: 0,
    updated: 0,
    skipped: 0,
    dryRun,
    persist: shouldPersist,
    errors: []
  };

  for (let index = 0; index < products.length; index += CHUNK_SIZE) {
    const chunk = products.slice(index, index + CHUNK_SIZE);

    for (const product of chunk) {
      try {
        const match = await matchSallaProduct({
          sku: product.sku,
          name: product.title
        });

        summary.processed += 1;

        if (!match.matched || !match.product || !match.method) {
          summary.skipped += 1;
          continue;
        }

        summary.matched += 1;

        if (shouldPersist) {
          await persistSallaMatch({
            productId: product.id,
            matchMethod: match.method,
            matchScore: match.score ?? 0,
            sallaProduct: match.product
          });
          summary.updated += 1;
        }
      } catch (error) {
        summary.ok = false;
        summary.errors.push({
          productId: product.id,
          sku: product.sku,
          message: error instanceof Error ? error.message : "Unknown Salla sync error"
        });
      }
    }
  }

  return summary;
}

export async function runSingleSallaMatch(input: {
  productId?: string;
  sku?: string | null;
  name?: string | null;
  persist?: boolean;
}) {
  const shouldPersist = input.persist ?? true;

  let product =
    input.productId
      ? await prisma.product.findUnique({
          where: { id: input.productId },
          select: { id: true, sku: true, title: true }
        })
      : null;

  if (!product && input.sku && shouldPersist) {
    product = await prisma.product.findUnique({
      where: { sku: input.sku },
      select: { id: true, sku: true, title: true }
    });
  }

  if (shouldPersist && !product) {
    throw new Error("A local productId or existing product SKU is required when persist=true");
  }

  const match = await matchSallaProduct({
    sku: product?.sku ?? input.sku ?? null,
    name: product?.title ?? input.name ?? null
  });

  if (shouldPersist && product && match.matched && match.product && match.method) {
    const persisted = await persistSallaMatch({
      productId: product.id,
      matchMethod: match.method,
      matchScore: match.score ?? 0,
      sallaProduct: match.product
    });

    return {
      match,
      persisted: true,
      costWithoutTax: persisted.costWithoutTax
    };
  }

  return {
    match,
    persisted: false,
    costWithoutTax: match.product ? selectCostWithoutTax(match.product) : null
  };
}

export function matchPreview(match: SallaMatchOutcome) {
  return {
    matched: match.matched,
    reason: match.reason,
    method: match.method,
    score: match.score,
    product: match.product
      ? {
          id: match.product.id,
          sku: match.product.sku,
          name: match.product.name,
          quantity: match.product.quantity,
          preTaxPrice: match.product.preTaxPrice,
          costPrice: match.product.costPrice
        }
      : null,
    candidates: match.candidates
  };
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSallaBatchSync, runSingleSallaMatch } from "@/lib/salla/sync";
import { matchSallaProduct } from "@/lib/salla/matcher";
import { prisma } from "@/lib/db/prisma";

const {
  productUpdateMock,
  productSettingsUpsertMock,
  productFindUniqueMock,
  productFindManyMock,
  transactionMock
} = vi.hoisted(() => {
  const productUpdate = vi.fn();
  const productSettingsUpsert = vi.fn();
  const productFindUnique = vi.fn();
  const productFindMany = vi.fn();

  return {
    productUpdateMock: productUpdate,
    productSettingsUpsertMock: productSettingsUpsert,
    productFindUniqueMock: productFindUnique,
    productFindManyMock: productFindMany,
    transactionMock: {
      product: { update: productUpdate },
      productSettings: { upsert: productSettingsUpsert }
    }
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: typeof transactionMock) => unknown) => callback(transactionMock)),
    product: {
      findUnique: productFindUniqueMock,
      findMany: productFindManyMock,
      update: productUpdateMock
    },
    productSettings: {
      upsert: productSettingsUpsertMock
    }
  }
}));

vi.mock("@/lib/salla/matcher", () => ({
  matchSallaProduct: vi.fn()
}));

describe("salla sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies local cost and quantity updates when persist=true", async () => {
    productFindUniqueMock.mockResolvedValue({
      id: "prod-1",
      sku: "SKU-1",
      title: "Sample Name"
    });

    vi.mocked(matchSallaProduct).mockResolvedValue({
      matched: true,
      method: "SKU",
      score: 1,
      reason: "MATCHED",
      product: {
        id: "salla-1",
        sku: "SKU-1",
        name: "Sample Name",
        quantity: 9,
        preTaxPrice: 120,
        costPrice: 95,
        raw: { id: "salla-1" }
      },
      candidates: []
    });

    const result = await runSingleSallaMatch({ productId: "prod-1", persist: true });

    expect(result.persisted).toBe(true);
    expect(productSettingsUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { costPrice: 120 }
      })
    );
    expect(productUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sallaQuantity: 9,
          sallaMatchMethod: "SKU"
        })
      })
    );
  });

  it("supports dry run with persist=false", async () => {
    productFindUniqueMock.mockResolvedValue(null);
    vi.mocked(matchSallaProduct).mockResolvedValue({
      matched: true,
      method: "NAME",
      score: 0.82,
      reason: "MATCHED",
      product: {
        id: "salla-2",
        sku: "SKU-DRY",
        name: "Dry Run Product",
        quantity: 4,
        preTaxPrice: 45,
        costPrice: 39,
        raw: {}
      },
      candidates: []
    });

    const result = await runSingleSallaMatch({
      sku: "SKU-DRY",
      name: "Dry Run Product",
      persist: false
    });

    expect(result.persisted).toBe(false);
    expect(productSettingsUpsertMock).not.toHaveBeenCalled();
    expect(productUpdateMock).not.toHaveBeenCalled();
  });

  it("does not write locally during dryRun batch sync", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "p1", sku: "SKU-1", title: "Product One" },
      { id: "p2", sku: "SKU-2", title: "Product Two" }
    ]);

    vi.mocked(matchSallaProduct)
      .mockResolvedValueOnce({
        matched: true,
        method: "SKU",
        score: 1,
        reason: "MATCHED",
        product: {
          id: "salla-1",
          sku: "SKU-1",
          name: "Product One",
          quantity: 7,
          preTaxPrice: 50,
          costPrice: 44,
          raw: {}
        },
        candidates: []
      })
      .mockResolvedValueOnce({
        matched: false,
        method: null,
        score: null,
        reason: "NO_CANDIDATES",
        product: null,
        candidates: []
      });

    const summary = await runSallaBatchSync({
      activeOnly: true,
      limit: 10,
      offset: 0,
      persist: true,
      dryRun: true
    });

    expect(summary.total).toBe(2);
    expect(summary.matched).toBe(1);
    expect(summary.updated).toBe(0);
    expect(productSettingsUpsertMock).not.toHaveBeenCalled();
    expect(productUpdateMock).not.toHaveBeenCalled();
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true }
      })
    );
  });
});

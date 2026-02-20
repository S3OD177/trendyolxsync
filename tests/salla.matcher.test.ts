import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchSallaProduct, pickBestNameMatch, scoreNameSimilarity } from "@/lib/salla/matcher";
import { sallaClient } from "@/lib/salla/client";
import type { SallaProductRecord } from "@/lib/salla/types";

vi.mock("@/lib/salla/client", () => ({
  sallaClient: {
    fetchProductBySku: vi.fn(),
    searchProductsByKeyword: vi.fn()
  }
}));

const product = (overrides: Partial<SallaProductRecord> = {}): SallaProductRecord => ({
  id: "1",
  sku: "SKU-1",
  name: "Apple iPhone 15 Pro Max 256GB",
  quantity: 12,
  preTaxPrice: 4500,
  costPrice: 4200,
  raw: {},
  ...overrides
});

describe("salla matcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches exact SKU first", async () => {
    vi.mocked(sallaClient.fetchProductBySku).mockResolvedValue(product());
    vi.mocked(sallaClient.searchProductsByKeyword).mockResolvedValue([]);

    const result = await matchSallaProduct({
      sku: "SKU-1",
      name: "Some Name"
    });

    expect(result.matched).toBe(true);
    expect(result.method).toBe("SKU");
    expect(result.score).toBe(1);
    expect(sallaClient.searchProductsByKeyword).not.toHaveBeenCalled();
  });

  it("falls back to keyword matching and picks best candidate", async () => {
    vi.mocked(sallaClient.fetchProductBySku).mockResolvedValue(null);
    vi.mocked(sallaClient.searchProductsByKeyword).mockResolvedValue([
      product({ id: "2", name: "iPhone 15 Pro Case", sku: "CASE-1" }),
      product({ id: "3", name: "Apple iPhone 15 Pro Max 256GB", sku: "IP15PM-256" }),
      product({ id: "4", name: "Samsung Galaxy S24", sku: "S24-1" })
    ]);

    const result = await matchSallaProduct({
      sku: "MISSING",
      name: "iPhone 15 Pro Max 256"
    });

    expect(result.matched).toBe(true);
    expect(result.method).toBe("NAME");
    expect(result.product?.sku).toBe("IP15PM-256");
    expect((result.score ?? 0) >= 0.6).toBe(true);
  });

  it("rejects low-confidence keyword matches", async () => {
    vi.mocked(sallaClient.fetchProductBySku).mockResolvedValue(null);
    vi.mocked(sallaClient.searchProductsByKeyword).mockResolvedValue([
      product({ id: "5", name: "Garden Hose", sku: "HOME-1" }),
      product({ id: "6", name: "Dishwasher Tablet", sku: "HOME-2" })
    ]);

    const result = await matchSallaProduct({
      name: "Running Shoes Nike"
    });

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("NO_CONFIDENT_MATCH");
  });

  it("provides deterministic similarity scoring", () => {
    const exact = scoreNameSimilarity("iphone 15 pro max", "iphone 15 pro max");
    const partial = scoreNameSimilarity("iphone 15 pro max", "iphone 15 case");
    const none = scoreNameSimilarity("iphone 15 pro max", "dishwasher tablets");

    expect(exact).toBe(1);
    expect(partial).toBeGreaterThan(none);
  });

  it("pickBestNameMatch returns null below threshold", () => {
    const best = pickBestNameMatch([product({ name: "Kitchen Knife Set" })], "Gaming Laptop", 0.6);
    expect(best).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { mapSallaProduct } from "@/lib/salla/client";
import { selectCostWithoutTax } from "@/lib/salla/sync";

describe("salla mapping", () => {
  it("maps pre_tax_price, cost_price, and quantity", () => {
    const mapped = mapSallaProduct({
      id: 1001,
      sku: "ABC-123",
      name: "Sample Product",
      quantity: "14",
      pre_tax_price: {
        amount: "129.99"
      },
      cost_price: "100.25"
    });

    expect(mapped).toEqual({
      id: "1001",
      sku: "ABC-123",
      name: "Sample Product",
      quantity: 14,
      preTaxPrice: 129.99,
      costPrice: 100.25,
      raw: expect.any(Object)
    });
  });

  it("handles null and missing numeric fields safely", () => {
    const mapped = mapSallaProduct({
      id: "X1",
      name: "No Price Product",
      sku: null
    });

    expect(mapped).not.toBeNull();
    expect(mapped?.quantity).toBeNull();
    expect(mapped?.preTaxPrice).toBeNull();
    expect(mapped?.costPrice).toBeNull();
  });

  it("selects PRE_TAX by default and falls back when missing", () => {
    const base = {
      id: "P1",
      sku: "SKU",
      name: "Name",
      quantity: 2,
      preTaxPrice: 80,
      costPrice: 65,
      raw: {}
    };

    expect(selectCostWithoutTax(base, "PRE_TAX")).toBe(80);
    expect(selectCostWithoutTax({ ...base, preTaxPrice: null }, "PRE_TAX")).toBe(65);
    expect(selectCostWithoutTax(base, "COST_PRICE")).toBe(65);
  });
});

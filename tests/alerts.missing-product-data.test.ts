import { describe, expect, it } from "vitest";
import {
  buildMissingProductDataMessage,
  detectMissingProductFields
} from "@/lib/alerts/missing-product-data";

describe("detectMissingProductFields", () => {
  it("detects missing cost", () => {
    const missing = detectMissingProductFields({
      sku: "SKU-100",
      title: "Example Product",
      costPrice: 0
    });

    expect(missing).toEqual(["costPrice"]);
  });

  it("detects missing title", () => {
    const missing = detectMissingProductFields({
      sku: "SKU-100",
      title: "  ",
      costPrice: 12.5
    });

    expect(missing).toEqual(["title"]);
  });

  it("returns no missing fields when required data is present", () => {
    const missing = detectMissingProductFields({
      sku: "SKU-100",
      title: "Example Product",
      costPrice: 12.5
    });

    expect(missing).toEqual([]);
  });
});

describe("buildMissingProductDataMessage", () => {
  it("formats a readable alert message", () => {
    const message = buildMissingProductDataMessage("SKU-100", ["costPrice", "title"]);

    expect(message).toContain("SKU SKU-100");
    expect(message).toContain("Cost Price");
    expect(message).toContain("Title");
  });
});

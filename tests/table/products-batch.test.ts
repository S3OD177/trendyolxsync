import { describe, expect, it } from "vitest";
import { runProductsSuggestBatch, type ProductsSuggestBatchItem } from "@/lib/table/products-batch";

const ITEMS: ProductsSuggestBatchItem[] = [
  { productId: "p1", sku: "SKU-1" },
  { productId: "p2", sku: "SKU-2" },
  { productId: "p3", sku: "SKU-3" },
  { productId: "p4", sku: "SKU-4" }
];

describe("products-batch", () => {
  it("continues processing when rows fail", async () => {
    const progress: Array<{ completed: number; succeeded: number; failed: number }> = [];

    const result = await runProductsSuggestBatch({
      items: ITEMS,
      concurrency: 3,
      execute: async (item) => {
        if (item.productId === "p2") {
          return { ok: false, error: "Blocked by floor", status: 422, enforcedFloor: 145 };
        }

        if (item.productId === "p3") {
          throw new Error("Network down");
        }

        return { ok: true };
      },
      onProgress: (next) => {
        progress.push({
          completed: next.completed,
          succeeded: next.succeeded,
          failed: next.failed
        });
      }
    });

    expect(result.total).toBe(4);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((failure) => failure.productId).sort()).toEqual(["p2", "p3"]);

    expect(progress[0]).toEqual({ completed: 0, succeeded: 0, failed: 0 });
    expect(progress.at(-1)).toEqual({ completed: 4, succeeded: 2, failed: 2 });
  });

  it("respects configured concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await runProductsSuggestBatch({
      items: [
        ...ITEMS,
        { productId: "p5", sku: "SKU-5" },
        { productId: "p6", sku: "SKU-6" }
      ],
      concurrency: 3,
      execute: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight -= 1;
        return { ok: true };
      }
    });

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });
});

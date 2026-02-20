import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCTS_COLUMN_VISIBILITY,
  DEFAULT_PRODUCTS_QUICK_FILTERS,
  DEFAULT_PRODUCTS_TABLE_SORTING,
  PRODUCTS_TABLE_PREFS_STORAGE_KEY,
  getDefaultProductsTablePrefs,
  loadProductsTablePrefs,
  matchesProductsSearch,
  parseProductsTablePrefs,
  saveProductsTablePrefs,
  serializeProductsTablePrefs
} from "@/lib/table/products-table-state";

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    }
  };
}

describe("products-table-state", () => {
  it("returns expected sort defaults", () => {
    const prefs = getDefaultProductsTablePrefs();
    expect(prefs.sorting).toEqual(DEFAULT_PRODUCTS_TABLE_SORTING);
    expect(prefs.sorting).toEqual([{ id: "lastCheckedAt", desc: true }]);
  });

  it("returns expected column visibility defaults", () => {
    const prefs = getDefaultProductsTablePrefs();
    expect(prefs.columnVisibility).toEqual(DEFAULT_PRODUCTS_COLUMN_VISIBILITY);
    expect(prefs.columnVisibility.deltaSar).toBe(true);
    expect(prefs.columnVisibility.barcode).toBe(false);
  });

  it("returns expected quick filter defaults", () => {
    const prefs = getDefaultProductsTablePrefs();
    expect(prefs.quickFilters).toEqual(DEFAULT_PRODUCTS_QUICK_FILTERS);
  });

  it("round-trips serialization and storage", () => {
    const storage = createStorage();
    const prefs = {
      density: "compact" as const,
      sorting: [{ id: "sku", desc: false }],
      columnVisibility: {
        ...DEFAULT_PRODUCTS_COLUMN_VISIBILITY,
        barcode: true
      },
      quickFilters: {
        lostOnly: true,
        lowMarginRisk: false
      }
    };

    const raw = serializeProductsTablePrefs(prefs);
    const parsed = parseProductsTablePrefs(raw);
    expect(parsed).toEqual(prefs);

    saveProductsTablePrefs(prefs, storage as Storage);
    expect(storage.getItem(PRODUCTS_TABLE_PREFS_STORAGE_KEY)).toBe(raw);

    const loaded = loadProductsTablePrefs(storage as Storage);
    expect(loaded).toEqual(prefs);
  });

  it("matches search against sku/title/barcode", () => {
    const row = {
      sku: "SKU-ABC-123",
      title: "Wireless Charger",
      barcode: "987654"
    };

    expect(matchesProductsSearch(row, "abc")).toBe(true);
    expect(matchesProductsSearch(row, "wireless")).toBe(true);
    expect(matchesProductsSearch(row, "987")).toBe(true);
    expect(matchesProductsSearch(row, "missing")).toBe(false);
  });

  it("migrates legacy delta visibility key to deltaSar", () => {
    const parsed = parseProductsTablePrefs(
      JSON.stringify({
        density: "comfortable",
        sorting: [{ id: "lastCheckedAt", desc: true }],
        columnVisibility: {
          ...DEFAULT_PRODUCTS_COLUMN_VISIBILITY,
          deltaSar: undefined,
          delta: false
        },
        quickFilters: {
          lostOnly: false,
          lowMarginRisk: true
        }
      })
    );

    expect(parsed?.columnVisibility.deltaSar).toBe(false);
    expect(parsed?.quickFilters.lowMarginRisk).toBe(true);
  });
});

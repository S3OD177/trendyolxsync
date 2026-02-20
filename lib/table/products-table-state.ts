export const PRODUCTS_TABLE_PREFS_STORAGE_KEY = "products_table_prefs_v1";

export type ProductsTableDensity = "comfortable" | "compact";

export interface ProductsTableQuickFilters {
  lostOnly: boolean;
  lowMarginRisk: boolean;
}

export interface ProductsTableSort {
  id: string;
  desc: boolean;
}

export interface ProductsTablePrefs {
  density: ProductsTableDensity;
  sorting: ProductsTableSort[];
  columnVisibility: Record<string, boolean>;
  quickFilters: ProductsTableQuickFilters;
}

export interface ProductsSearchRow {
  sku: string;
  title: string;
  barcode: string | null;
}

export const DEFAULT_PRODUCTS_TABLE_SORTING: ProductsTableSort[] = [
  { id: "lastCheckedAt", desc: true }
];

export const DEFAULT_PRODUCTS_COLUMN_VISIBILITY: Record<string, boolean> = {
  barcode: false,
  listingId: false,
  deltaSar: true,
  marginPct: false,
  lastCheckedAt: false
};

export const DEFAULT_PRODUCTS_QUICK_FILTERS: ProductsTableQuickFilters = {
  lostOnly: false,
  lowMarginRisk: false
};

export function getDefaultProductsTablePrefs(): ProductsTablePrefs {
  return {
    density: "comfortable",
    sorting: [...DEFAULT_PRODUCTS_TABLE_SORTING],
    columnVisibility: { ...DEFAULT_PRODUCTS_COLUMN_VISIBILITY },
    quickFilters: { ...DEFAULT_PRODUCTS_QUICK_FILTERS }
  };
}

export function serializeProductsTablePrefs(prefs: ProductsTablePrefs): string {
  return JSON.stringify(prefs);
}

export function parseProductsTablePrefs(raw: string | null | undefined): ProductsTablePrefs | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProductsTablePrefs>;
    const defaults = getDefaultProductsTablePrefs();

    const density =
      parsed.density === "compact" || parsed.density === "comfortable"
        ? parsed.density
        : defaults.density;

    const sorting = Array.isArray(parsed.sorting)
      ? parsed.sorting
          .map((entry) => ({
            id: typeof entry?.id === "string" ? entry.id : "",
            desc: !!entry?.desc
          }))
          .filter((entry) => entry.id.length > 0)
          .slice(0, 1)
      : defaults.sorting;

    const columnVisibility =
      parsed.columnVisibility && typeof parsed.columnVisibility === "object"
        ? {
            ...defaults.columnVisibility,
            ...Object.fromEntries(
              Object.entries(parsed.columnVisibility).filter(
                ([key, value]) => key !== "delta" && typeof value === "boolean"
              )
            ),
            ...(typeof (parsed.columnVisibility as Record<string, unknown>).deltaSar === "boolean"
              ? { deltaSar: (parsed.columnVisibility as Record<string, boolean>).deltaSar }
              : typeof (parsed.columnVisibility as Record<string, unknown>).delta === "boolean"
                ? { deltaSar: (parsed.columnVisibility as Record<string, boolean>).delta }
                : {})
          }
        : defaults.columnVisibility;

    const parsedQuickFilters =
      parsed.quickFilters && typeof parsed.quickFilters === "object"
        ? (parsed.quickFilters as Partial<ProductsTableQuickFilters>)
        : null;

    const quickFilters = {
      lostOnly:
        typeof parsedQuickFilters?.lostOnly === "boolean"
          ? parsedQuickFilters.lostOnly
          : defaults.quickFilters.lostOnly,
      lowMarginRisk:
        typeof parsedQuickFilters?.lowMarginRisk === "boolean"
          ? parsedQuickFilters.lowMarginRisk
          : defaults.quickFilters.lowMarginRisk
    };

    return {
      density,
      sorting: sorting.length ? sorting : defaults.sorting,
      columnVisibility,
      quickFilters
    };
  } catch {
    return null;
  }
}

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function loadProductsTablePrefs(storage = getBrowserStorage()): ProductsTablePrefs {
  if (!storage) {
    return getDefaultProductsTablePrefs();
  }

  const parsed = parseProductsTablePrefs(storage.getItem(PRODUCTS_TABLE_PREFS_STORAGE_KEY));
  return parsed ?? getDefaultProductsTablePrefs();
}

export function saveProductsTablePrefs(prefs: ProductsTablePrefs, storage = getBrowserStorage()) {
  if (!storage) {
    return;
  }

  storage.setItem(PRODUCTS_TABLE_PREFS_STORAGE_KEY, serializeProductsTablePrefs(prefs));
}

export function matchesProductsSearch(row: ProductsSearchRow, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    row.sku.toLowerCase().includes(normalized) ||
    row.title.toLowerCase().includes(normalized) ||
    (row.barcode ?? "").toLowerCase().includes(normalized)
  );
}

export interface MissingProductDataInput {
  sku: string;
  title: string | null;
  costPrice: number;
}

const FIELD_LABELS: Record<string, string> = {
  costPrice: "Cost Price",
  title: "Title",
  sku: "SKU"
};

export function detectMissingProductFields(input: MissingProductDataInput): string[] {
  const missing: string[] = [];

  if (!input.sku?.trim()) {
    missing.push("sku");
  }

  if (!input.title?.trim()) {
    missing.push("title");
  }

  if (!Number.isFinite(input.costPrice) || input.costPrice <= 0) {
    missing.push("costPrice");
  }

  return missing;
}

export function buildMissingProductDataMessage(sku: string, missingFields: string[]): string {
  const readableFields = missingFields.map((field) => FIELD_LABELS[field] ?? field);
  return `SKU ${sku} is missing required data: ${readableFields.join(", ")}`;
}

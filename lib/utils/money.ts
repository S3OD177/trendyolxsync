export const roundMoney = (value: number) => Math.max(0, Math.round(value * 100) / 100);
export const ceilMoney = (value: number) => Math.max(0, Math.ceil(value * 100) / 100);

export const formatSar = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

export const safeNumber = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

import { z } from "zod";

const postgresDatabaseUrl = z
  .string()
  .min(1)
  .refine((value) => /^postgres(ql)?:\/\//i.test(value), {
    message: "DATABASE_URL must start with postgresql:// or postgres://"
  });

const booleanLike = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.toLowerCase())
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: postgresDatabaseUrl,

  APP_URL: z.string().url().default("http://localhost:3000"),
  CRON_SECRET: z.string().min(8).default("change-me-in-production"),
  APP_PIN: z.string().regex(/^\d{4}$/).default("3698"),

  TRENDYOL_SUPPLIER_ID: z.string().optional(),
  TRENDYOL_SELLER_ID: z.string().optional(),
  TRENDYOL_API_KEY: z.string().optional(),
  TRENDYOL_API_SECRET: z.string().optional(),
  TRENDYOL_API_TOKEN: z.string().optional(),
  TRENDYOL_BASE_URL: z.string().url().default("https://apigw.trendyol.com"),
  TRENDYOL_USER_AGENT: z.string().optional(),
  TRENDYOL_STOREFRONT_CODE: z.string().default("SA"),

  SALLA_BASE_URL: z.string().url().default("https://api.salla.dev/admin/v2"),
  SALLA_OAUTH_BASE_URL: z.string().url().default("https://accounts.salla.sa"),
  SALLA_CLIENT_ID: z.string().optional(),
  SALLA_CLIENT_SECRET: z.string().optional(),
  SALLA_ACCESS_TOKEN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().optional()
  ),
  SALLA_REDIRECT_URI: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().url().optional()
  ),
  SALLA_COST_SOURCE: z.enum(["PRE_TAX", "COST_PRICE"]).default("PRE_TAX"),

  DEFAULT_VAT_RATE: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 15)),
  DEFAULT_COOLDOWN_MINUTES: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 15)),
  AUTO_SYNC_CATALOG: booleanLike.default(true),
  AUTO_SYNC_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(50),
  AUTO_SYNC_PAGE_SIZE: z.coerce.number().int().min(1).max(200).default(50)
});

export const env = envSchema.parse({
  ...process.env
});

export const isProduction = env.NODE_ENV === "production";

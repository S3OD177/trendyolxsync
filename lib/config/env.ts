import { z } from "zod";

const resolvedDatabaseUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const resolvedDbProvider = resolvedDatabaseUrl.startsWith("postgres") ? "postgresql" : "sqlite";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

if (!process.env.DB_PROVIDER) {
  process.env.DB_PROVIDER = resolvedDbProvider;
}

const booleanLike = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === "boolean" ? value : ["1", "true", "yes", "on"].includes(value.toLowerCase())
  );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DB_PROVIDER: z.enum(["postgresql", "sqlite"]),

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

  DEFAULT_VAT_RATE: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 15)),
  DEFAULT_COOLDOWN_MINUTES: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 15)),
  AUTO_SYNC_CATALOG: booleanLike.default(true),
  AUTO_SYNC_MAX_PAGES: z.coerce.number().int().min(1).max(50).default(5),
  AUTO_SYNC_PAGE_SIZE: z.coerce.number().int().min(1).max(200).default(50)
});

export const env = envSchema.parse({
  ...process.env,
  DATABASE_URL: resolvedDatabaseUrl,
  DB_PROVIDER: resolvedDbProvider
});

export const isProduction = env.NODE_ENV === "production";

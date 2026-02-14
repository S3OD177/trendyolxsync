import { z } from "zod";

const resolvedDatabaseUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
const resolvedDbProvider = resolvedDatabaseUrl.startsWith("postgres") ? "postgresql" : "sqlite";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = resolvedDatabaseUrl;
}

if (!process.env.DB_PROVIDER) {
  process.env.DB_PROVIDER = resolvedDbProvider;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DB_PROVIDER: z.enum(["postgresql", "sqlite"]),

  APP_URL: z.string().url().default("http://localhost:3000"),
  CRON_SECRET: z.string().min(8).default("change-me-in-production"),

  TRENDYOL_SUPPLIER_ID: z.string().optional(),
  TRENDYOL_SELLER_ID: z.string().optional(),
  TRENDYOL_API_KEY: z.string().optional(),
  TRENDYOL_API_SECRET: z.string().optional(),
  TRENDYOL_API_TOKEN: z.string().optional(),
  TRENDYOL_BASE_URL: z.string().url().default("https://apigw.trendyol.com"),
  TRENDYOL_USER_AGENT: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  ADMIN_PASSWORD: z.string().optional(),

  DEFAULT_VAT_RATE: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 15)),
  DEFAULT_COOLDOWN_MINUTES: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : 15))
});

export const env = envSchema.parse({
  ...process.env,
  DATABASE_URL: resolvedDatabaseUrl,
  DB_PROVIDER: resolvedDbProvider
});

export const isProduction = env.NODE_ENV === "production";

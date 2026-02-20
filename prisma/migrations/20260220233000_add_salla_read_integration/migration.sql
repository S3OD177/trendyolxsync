-- Add Salla tracking columns to local products.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaProductId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaSku" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaName" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaQuantity" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaPreTaxPrice" DECIMAL(65,30);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaCostPrice" DECIMAL(65,30);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaMatchMethod" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaMatchScore" DECIMAL(65,30);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaLastSyncedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sallaRawPayload" JSONB;

-- Store one OAuth credential record for Salla API reads.
CREATE TABLE IF NOT EXISTS "salla_credentials" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "merchantId" TEXT,
    "accessTokenEncoded" TEXT NOT NULL,
    "refreshTokenEncoded" TEXT,
    "tokenType" TEXT,
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salla_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "salla_credentials_key_key" ON "salla_credentials"("key");

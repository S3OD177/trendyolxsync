-- CreateEnum
CREATE TYPE "BuyBoxStatus" AS ENUM ('WIN', 'LOSE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ServiceFeeType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "MinProfitType" AS ENUM ('SAR', 'PERCENT');

-- CreateEnum
CREATE TYPE "PriceChangeMethod" AS ENUM ('SUGGESTED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOST_BUYBOX', 'COMPETITOR_DROP', 'NOT_COMPETITIVE', 'SAFE_REPRICE', 'PRICE_WAR');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARN', 'CRITICAL');

-- CreateEnum
CREATE TYPE "VatMode" AS ENUM ('INCLUSIVE', 'EXCLUSIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" VARCHAR(64),
    "title" TEXT NOT NULL,
    "trendyolProductId" VARCHAR(128),
    "category" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "commissionRate" DECIMAL(10,4) NOT NULL DEFAULT 0.15,
    "serviceFeeType" "ServiceFeeType" NOT NULL DEFAULT 'PERCENT',
    "serviceFeeValue" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "shippingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "handlingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "vatMode" "VatMode" NOT NULL DEFAULT 'INCLUSIVE',
    "minProfitType" "MinProfitType" NOT NULL DEFAULT 'SAR',
    "minProfitValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "undercutStep" DECIMAL(10,2) NOT NULL DEFAULT 0.5,
    "alertThresholdSar" DECIMAL(10,2) NOT NULL DEFAULT 2,
    "alertThresholdPct" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 15,
    "competitorDropPct" DECIMAL(10,2) NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSettings" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "costPrice" DECIMAL(10,2) NOT NULL,
    "commissionRate" DECIMAL(10,4),
    "serviceFeeType" "ServiceFeeType",
    "serviceFeeValue" DECIMAL(10,4),
    "shippingCost" DECIMAL(10,2),
    "handlingCost" DECIMAL(10,2),
    "vatRate" DECIMAL(5,2),
    "vatMode" "VatMode",
    "minProfitType" "MinProfitType",
    "minProfitValue" DECIMAL(10,2),
    "undercutStep" DECIMAL(10,2),
    "alertThresholdSar" DECIMAL(10,2),
    "alertThresholdPct" DECIMAL(10,2),
    "cooldownMinutes" INTEGER,
    "competitorDropPct" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ourPrice" DECIMAL(10,2),
    "competitorMinPrice" DECIMAL(10,2),
    "competitorCount" INTEGER,
    "buyboxStatus" "BuyBoxStatus" NOT NULL DEFAULT 'UNKNOWN',
    "buyboxSellerId" TEXT,
    "rawPayloadJson" JSONB,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "metadataJson" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceChangeLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oldPrice" DECIMAL(10,2),
    "newPrice" DECIMAL(10,2) NOT NULL,
    "method" "PriceChangeMethod" NOT NULL,
    "requestedByUserId" TEXT,
    "trendyolResponseJson" JSONB,

    CONSTRAINT "PriceChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobLock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSettings_productId_key" ON "ProductSettings"("productId");

-- CreateIndex
CREATE INDEX "PriceSnapshot_productId_checkedAt_idx" ON "PriceSnapshot"("productId", "checkedAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_isRead_createdAt_idx" ON "Alert"("isRead", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PriceChangeLog_productId_createdAt_idx" ON "PriceChangeLog"("productId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "JobLock_name_key" ON "JobLock"("name");

-- AddForeignKey
ALTER TABLE "ProductSettings" ADD CONSTRAINT "ProductSettings_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChangeLog" ADD CONSTRAINT "PriceChangeLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceChangeLog" ADD CONSTRAINT "PriceChangeLog_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "Alert_isRead_createdAt_idx";

-- DropIndex
DROP INDEX "PriceChangeLog_productId_createdAt_idx";

-- DropIndex
DROP INDEX "PriceSnapshot_productId_checkedAt_idx";

-- AlterTable
ALTER TABLE "GlobalSettings" ALTER COLUMN "commissionRate" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "serviceFeeValue" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "shippingCost" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "handlingCost" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "vatRate" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "minProfitValue" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "undercutStep" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "alertThresholdSar" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "alertThresholdPct" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "competitorDropPct" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "PriceChangeLog" ALTER COLUMN "oldPrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "newPrice" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "PriceSnapshot" ALTER COLUMN "ourPrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "competitorMinPrice" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "barcode" SET DATA TYPE TEXT,
ALTER COLUMN "trendyolProductId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "ProductSettings" ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "commissionRate" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "serviceFeeValue" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "shippingCost" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "handlingCost" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "vatRate" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "minProfitValue" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "undercutStep" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "alertThresholdSar" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "alertThresholdPct" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "competitorDropPct" SET DATA TYPE DECIMAL(65,30);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "sellerId" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "customerFirstName" TEXT,
    "customerLastName" TEXT,
    "customerEmail" TEXT,
    "tcIdentityNumber" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "estimatedDeliveryStart" TIMESTAMP(3),
    "estimatedDeliveryEnd" TIMESTAMP(3),
    "shipmentPackageId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "vatBaseAmount" DECIMAL(65,30),
    "merchantSku" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_sellerId_idx" ON "orders"("sellerId");

-- CreateIndex
CREATE INDEX "orders_createdDate_idx" ON "orders"("createdDate" DESC);

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_sku_idx" ON "order_items"("sku");

-- CreateIndex
CREATE INDEX "Alert_isRead_createdAt_idx" ON "Alert"("isRead", "createdAt");

-- CreateIndex
CREATE INDEX "PriceChangeLog_productId_createdAt_idx" ON "PriceChangeLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceSnapshot_productId_checkedAt_idx" ON "PriceSnapshot"("productId", "checkedAt");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

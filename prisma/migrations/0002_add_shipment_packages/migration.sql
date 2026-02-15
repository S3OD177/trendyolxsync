-- CreateTable
CREATE TABLE "shipment_packages" (
    "id" TEXT NOT NULL,
    "sellerId" BIGINT NOT NULL,
    "packageNumber" TEXT NOT NULL,
    "orderNumber" TEXT,
    "status" TEXT NOT NULL,
    "cargoProvider" TEXT,
    "trackingNumber" TEXT,
    "trackingLink" TEXT,
    "lastModifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3),
    "estimatedDeliveryStart" TIMESTAMP(3),
    "estimatedDeliveryEnd" TIMESTAMP(3),
    "linesCount" INTEGER,
    "rawPayload" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_packages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_packages_sellerId_packageNumber_key" ON "shipment_packages"("sellerId", "packageNumber");

-- CreateIndex
CREATE INDEX "shipment_packages_status_idx" ON "shipment_packages"("status");

-- CreateIndex
CREATE INDEX "shipment_packages_lastModifiedAt_idx" ON "shipment_packages"("lastModifiedAt" DESC);

-- CreateIndex
CREATE INDEX "shipment_packages_syncedAt_idx" ON "shipment_packages"("syncedAt" DESC);

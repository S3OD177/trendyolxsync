ALTER TABLE "Product" ADD COLUMN "sallaQuantity" INTEGER;
ALTER TABLE "Product" ADD COLUMN "sallaPreTaxPrice" DECIMAL(10, 2);
ALTER TABLE "Product" ADD COLUMN "sallaCostPrice" DECIMAL(10, 2);
ALTER TABLE "Product" ADD COLUMN "sallaLastSyncedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "AutoPilotStrategy" AS ENUM ('MATCH', 'BEAT_BY_1', 'BEAT_BY_5');

-- AlterTable
ALTER TABLE "ProductSettings" ADD COLUMN     "autoPilot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minPrice" DECIMAL(65,30),
ADD COLUMN     "strategy" "AutoPilotStrategy" NOT NULL DEFAULT 'MATCH';

-- CreateTable
CREATE TABLE "competitor_logs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "isBuyBoxWinner" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitor_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitor_logs_productId_checkedAt_idx" ON "competitor_logs"("productId", "checkedAt");

-- CreateIndex
CREATE INDEX "competitor_logs_competitorName_idx" ON "competitor_logs"("competitorName");

-- AddForeignKey
ALTER TABLE "competitor_logs" ADD CONSTRAINT "competitor_logs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

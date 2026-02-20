-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "returnStatus" TEXT,
    "customerFirstName" TEXT,
    "customerLastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_claimId_key" ON "return_requests"("claimId");

-- CreateIndex
CREATE INDEX "return_requests_status_idx" ON "return_requests"("status");

-- CreateIndex
CREATE INDEX "return_requests_orderNumber_idx" ON "return_requests"("orderNumber");

-- CreateIndex
CREATE INDEX "return_items_returnRequestId_idx" ON "return_items"("returnRequestId");

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

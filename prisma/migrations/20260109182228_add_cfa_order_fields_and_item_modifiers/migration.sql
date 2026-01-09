-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('PICKUP', 'DELIVERY', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "guestCount" INTEGER,
ADD COLUMN     "paperGoods" BOOLEAN,
ADD COLUMN     "storeCode" TEXT,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "parentItemId" TEXT;

-- CreateIndex
CREATE INDEX "Order_storeCode_idx" ON "Order"("storeCode");

-- CreateIndex
CREATE INDEX "Order_fulfillmentType_idx" ON "Order"("fulfillmentType");

-- CreateIndex
CREATE INDEX "OrderItem_parentItemId_idx" ON "OrderItem"("parentItemId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

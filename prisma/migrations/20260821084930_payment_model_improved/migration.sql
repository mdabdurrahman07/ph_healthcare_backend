/*
  Warnings:

  - A unique constraint covering the columns `[merchantInvoiceNumber]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `merchantInvoiceNumber` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refundAmount` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bkashPaymentId" TEXT,
ADD COLUMN     "bkashTrxId" TEXT,
ADD COLUMN     "gatewayResponse" JSONB,
ADD COLUMN     "merchantInvoiceNumber" TEXT NOT NULL,
ADD COLUMN     "paidAt" TEXT,
ADD COLUMN     "payerReference" TEXT,
ADD COLUMN     "paymentGateway" TEXT NOT NULL DEFAULT 'Bkash',
ADD COLUMN     "refundAmount" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundTrxId" TEXT,
ADD COLUMN     "refundedAt" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_merchantInvoiceNumber_key" ON "Payment"("merchantInvoiceNumber");

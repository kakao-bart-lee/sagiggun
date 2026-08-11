-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('RECEIVED', 'SPEC_REQUESTED', 'SPEC_RECEIVED', 'FORWARDED', 'ACCEPTED', 'DECLINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InquirySource" AS ENUM ('THREADS', 'WEB');

-- CreateEnum
CREATE TYPE "DeliveryKind" AS ENUM ('MATCH_PROPOSAL', 'SPEC_REQUEST', 'SPEC_FORWARD', 'CONNECT', 'OTHER');

-- AlterTable
ALTER TABLE "DeliveryItem" ADD COLUMN     "inquiryId" TEXT,
ADD COLUMN     "kind" "DeliveryKind" NOT NULL DEFAULT 'OTHER',
ALTER COLUMN "suggestionId" DROP NOT NULL,
ALTER COLUMN "toProfileId" DROP NOT NULL;

-- 기존 전달 항목은 전부 매칭 추천 수락으로 만들어졌다(다른 생성 경로가 없었다).
UPDATE "DeliveryItem" SET "kind" = 'MATCH_PROPOSAL' WHERE "suggestionId" IS NOT NULL;

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fromHandle" TEXT NOT NULL,
    "fromProfileId" TEXT,
    "source" "InquirySource" NOT NULL DEFAULT 'THREADS',
    "note" TEXT,
    "status" "InquiryStatus" NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inquiry_targetId_idx" ON "Inquiry"("targetId");

-- CreateIndex
CREATE INDEX "Inquiry_fromHandle_idx" ON "Inquiry"("fromHandle");

-- CreateIndex
CREATE INDEX "Inquiry_status_idx" ON "Inquiry"("status");

-- CreateIndex
CREATE INDEX "DeliveryItem_inquiryId_idx" ON "DeliveryItem"("inquiryId");

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_fromProfileId_fkey" FOREIGN KEY ("fromProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

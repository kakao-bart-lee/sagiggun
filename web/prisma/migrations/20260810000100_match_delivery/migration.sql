-- CreateEnum
CREATE TYPE "MatchSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'INSERTED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "MatchRun" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSuggestion" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "rationale" TEXT NOT NULL,
    "draftForSubject" TEXT NOT NULL,
    "draftForCandidate" TEXT NOT NULL,
    "status" "MatchSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryItem" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "toProfileId" TEXT NOT NULL,
    "toHandle" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchRun_subjectId_idx" ON "MatchRun"("subjectId");

-- CreateIndex
CREATE INDEX "MatchSuggestion_runId_idx" ON "MatchSuggestion"("runId");

-- CreateIndex
CREATE INDEX "MatchSuggestion_candidateId_idx" ON "MatchSuggestion"("candidateId");

-- CreateIndex
CREATE INDEX "MatchSuggestion_status_idx" ON "MatchSuggestion"("status");

-- CreateIndex
CREATE INDEX "DeliveryItem_suggestionId_idx" ON "DeliveryItem"("suggestionId");

-- CreateIndex
CREATE INDEX "DeliveryItem_toProfileId_idx" ON "DeliveryItem"("toProfileId");

-- CreateIndex
CREATE INDEX "DeliveryItem_status_idx" ON "DeliveryItem"("status");

-- CreateIndex
CREATE INDEX "DeliveryItem_toHandle_idx" ON "DeliveryItem"("toHandle");

-- AddForeignKey
ALTER TABLE "MatchRun" ADD CONSTRAINT "MatchRun_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSuggestion" ADD CONSTRAINT "MatchSuggestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MatchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchSuggestion" ADD CONSTRAINT "MatchSuggestion_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "MatchSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_toProfileId_fkey" FOREIGN KEY ("toProfileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

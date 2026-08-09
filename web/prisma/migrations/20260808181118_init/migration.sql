-- CreateEnum
CREATE TYPE "Status" AS ENUM ('COLLECTED', 'DRAFTED', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "seq" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'COLLECTED',
    "sourceHandle" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "gender" TEXT,
    "birthYear" INTEGER,
    "region" TEXT,
    "heightCm" INTEGER,
    "job" TEXT,
    "hobbies" TEXT[],
    "appealPoints" TEXT[],
    "idealType" TEXT[],
    "partnerBirthYearMin" INTEGER,
    "partnerBirthYearMax" INTEGER,
    "partnerRegions" TEXT[],
    "dealBreakers" TEXT[],
    "draftBody" TEXT,
    "finalBody" TEXT,
    "publishedPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_seq_key" ON "Profile"("seq");

-- CreateIndex
CREATE INDEX "Profile_sourceHandle_idx" ON "Profile"("sourceHandle");

-- CreateIndex
CREATE INDEX "Profile_status_idx" ON "Profile"("status");

-- CreateIndex
CREATE INDEX "Photo_profileId_idx" ON "Photo"("profileId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

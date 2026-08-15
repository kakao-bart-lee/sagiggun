-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "drinking" BOOLEAN,
ADD COLUMN     "faceType" TEXT,
ADD COLUMN     "partnerFaceTypes" TEXT[],
ADD COLUMN     "partnerHeightMax" INTEGER,
ADD COLUMN     "partnerHeightMin" INTEGER,
ADD COLUMN     "smoking" BOOLEAN,
ADD COLUMN     "tattoo" BOOLEAN;

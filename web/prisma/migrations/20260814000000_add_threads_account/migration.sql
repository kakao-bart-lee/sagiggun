-- CreateTable ThreadsAccount
CREATE TABLE "ThreadsAccount" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "threadsUserId" TEXT NOT NULL,
    "username" TEXT,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadsAccount_pkey" PRIMARY KEY ("id")
);

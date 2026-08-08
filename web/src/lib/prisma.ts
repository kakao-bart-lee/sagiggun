import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from './env';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  // process.env.DATABASE_URL을 직접 읽지 않는다 — getEnv()를 거쳐야
  // 값이 비었을 때 "무엇이 빠졌는지"를 말해주는 실패로 이어진다.
  const adapter = new PrismaPg({ connectionString: getEnv().databaseUrl });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

import type { ThreadsAccount } from '@prisma/client';

const SINGLETON_ID = 'singleton';

export type ThreadsAccountInfo = {
  threadsUserId: string;
  username: string | null;
  accessToken: string;
  tokenExpiresAt: Date;
};

function toInfo(row: ThreadsAccount): ThreadsAccountInfo {
  return {
    threadsUserId: row.threadsUserId,
    username: row.username,
    accessToken: row.accessToken,
    tokenExpiresAt: row.tokenExpiresAt,
  };
}

export async function getThreadsAccount(): Promise<ThreadsAccountInfo | null> {
  const { prisma } = await import('@/lib/prisma');
  const row = await prisma.threadsAccount.findUnique({ where: { id: SINGLETON_ID } });
  return row ? toInfo(row) : null;
}

// 운영자가 한 명이라 연결은 항상 하나뿐이다. upsert로 기존 연결을 덮어써 여러 행이
// 생기는 걸 원천적으로 막는다(재연결·다른 계정으로 다시 연결 모두 이 함수 하나로 처리).
export async function saveThreadsAccount(info: ThreadsAccountInfo): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.threadsAccount.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...info },
    update: { ...info },
  });
}

export async function updateThreadsAccessToken(
  accessToken: string,
  tokenExpiresAt: Date
): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.threadsAccount.update({
    where: { id: SINGLETON_ID },
    data: { accessToken, tokenExpiresAt },
  });
}

export async function clearThreadsAccount(): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.threadsAccount.deleteMany({ where: { id: SINGLETON_ID } });
}

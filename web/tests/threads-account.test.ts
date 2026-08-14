import { describe, it, expect, beforeEach, vi } from 'vitest';

type Row = {
  id: string;
  threadsUserId: string;
  username: string | null;
  accessToken: string;
  tokenExpiresAt: Date;
};

const rows = new Map<string, Row>();

// account.ts는 함수 안에서 prisma를 동적으로 불러온다(service.ts의 findDuplicates/markPublished와
// 같은 이유 — 모듈 최상단에서 가져오면 getEnv()가 즉시 실행된다). 그래서 이 테스트는 정적
// import로도 안전하다: 실제로 함수가 호출되기 전까지 '@/lib/prisma'는 로드되지 않는다.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    threadsAccount: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.get(where.id);
        return row ? { ...row } : null;
      }),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: Row;
          update: Partial<Row>;
        }) => {
          const existing = rows.get(where.id);
          const next = existing ? { ...existing, ...update } : { ...create };
          rows.set(where.id, next);
          return { ...next };
        }
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          const existing = rows.get(where.id);
          if (!existing) throw new Error('없는 행');
          const next = { ...existing, ...data };
          rows.set(where.id, next);
          return { ...next };
        }
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
        const existed = rows.has(where.id);
        rows.delete(where.id);
        return { count: existed ? 1 : 0 };
      }),
    },
  },
}));

import {
  getThreadsAccount,
  saveThreadsAccount,
  updateThreadsAccessToken,
  clearThreadsAccount,
} from '@/lib/threads/account';

describe('threads account 저장소', () => {
  beforeEach(() => rows.clear());

  it('연결 전에는 null이다', async () => {
    expect(await getThreadsAccount()).toBeNull();
  });

  it('저장하면 그대로 조회된다', async () => {
    await saveThreadsAccount({
      threadsUserId: 'u1',
      username: 'handle',
      accessToken: 'token1',
      tokenExpiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    expect(await getThreadsAccount()).toEqual({
      threadsUserId: 'u1',
      username: 'handle',
      accessToken: 'token1',
      tokenExpiresAt: new Date('2026-10-01T00:00:00Z'),
    });
  });

  it('다시 저장하면 싱글턴 행을 덮어쓴다(여러 행이 생기지 않는다)', async () => {
    await saveThreadsAccount({
      threadsUserId: 'u1',
      username: 'old',
      accessToken: 'token1',
      tokenExpiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    await saveThreadsAccount({
      threadsUserId: 'u2',
      username: 'new',
      accessToken: 'token2',
      tokenExpiresAt: new Date('2026-11-01T00:00:00Z'),
    });
    expect(rows.size).toBe(1);
    expect((await getThreadsAccount())?.username).toBe('new');
  });

  it('토큰만 갱신할 수 있고 username은 남는다', async () => {
    await saveThreadsAccount({
      threadsUserId: 'u1',
      username: 'handle',
      accessToken: 'old-token',
      tokenExpiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    await updateThreadsAccessToken('new-token', new Date('2026-12-01T00:00:00Z'));
    const account = await getThreadsAccount();
    expect(account?.accessToken).toBe('new-token');
    expect(account?.tokenExpiresAt).toEqual(new Date('2026-12-01T00:00:00Z'));
    expect(account?.username).toBe('handle');
  });

  it('연결 해제하면 다시 null이다', async () => {
    await saveThreadsAccount({
      threadsUserId: 'u1',
      username: null,
      accessToken: 'token1',
      tokenExpiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    await clearThreadsAccount();
    expect(await getThreadsAccount()).toBeNull();
  });
});

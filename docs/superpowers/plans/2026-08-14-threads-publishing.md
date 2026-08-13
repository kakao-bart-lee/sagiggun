# Threads Publishing API (서브시스템 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 프로필을 손으로 게시하는 대신 Meta Threads Publishing API로 실제 게시하고, 그 결과(게시 번호·post id)를 `Profile`에 기록한다.

**Architecture:** Next.js App Router (`web/`) 안에 새 `web/src/lib/threads/` 모듈(OAuth 교환·게시 호출을 하는 `client.ts`, 토큰을 DB에 저장·조회하는 `account.ts`)을 추가하고, 기존 `web/src/lib/profile/service.ts`의 `markPublished`를 `publishToThreads`로 대체한다. OAuth 연결은 관리자 설정 화면에서 하는 별도 라우트 4개(`connect`/`callback`/`disconnect`/`status`)로 처리한다. 기존 `deps` 주입 패턴(`markPublished`, `deletePhoto`)을 그대로 따른다.

**Tech Stack:** Next.js 16 (App Router) · Prisma 7 · Postgres · Vitest 4 · Playwright (e2e, 이번엔 수정만) · `fetch`(Node 내장, 별도 HTTP 라이브러리 없음)

**Spec:** [docs/superpowers/specs/2026-08-13-threads-publishing-design.md](../specs/2026-08-13-threads-publishing-design.md)

## Global Constraints

- **텍스트만 게시한다.** `finalBody`만 Threads에 올린다. 사진 첨부는 이번 범위에 없다.
- **"API로 게시"가 유일한 경로다.** 기존 수동 "게시되어 있음으로 표시" 버튼·`publish-mark` 라우트는 완전히 제거한다. API 실패 시 수동 우회는 만들지 않는다.
- **하루 250건 한도는 앱에서 추적하지 않는다.** Threads가 돌려주는 오류를 그대로 화면에 보여준다.
- **Threads 토큰은 Postgres(`ThreadsAccount` 싱글턴 테이블)에 저장한다.** GCP Secret Manager는 쓰지 않는다.
- **실제 `graph.threads.net`/`threads.net` 호출은 어떤 테스트에서도 하지 않는다.** 전부 주입(deps) 또는 `vi.mock`/`vi.stubGlobal('fetch', …)`으로 대체한다.
- **e2e(Playwright)에 새 Threads 커버리지를 추가하지 않는다.** 기존 `web/e2e/api-flow.spec.ts`의 `publish-mark` 참조만 새 라우트에 맞게 고친다 — Threads 연결은 OAuth 왕복이 필요해 로컬/CI에서 재현할 수 없다(스펙 §3).
- 새 파일의 주석은 WHY만 남긴다(기존 코드베이스 관례). 매직 넘버가 아닌 이유가 있는 상수는 그 이유를 한 줄 주석으로 남긴다.
- 모든 `/api/admin/threads/*`, `/api/profiles/[id]/publish` 라우트는 기존 미들웨어(`web/src/middleware.ts`의 `/api/:path*` matcher)가 자동으로 세션 또는 Bearer 인증을 요구한다 — 라우트 안에 별도 인증 코드를 넣지 않는다.

---

## Task 1: Prisma 스키마 — `ThreadsAccount` 모델

**Files:**
- Modify: `web/prisma/schema.prisma`

**Interfaces:**
- Produces: `ThreadsAccount` Prisma 모델 — `id`(항상 `"singleton"`), `threadsUserId: String`, `username: String?`, `accessToken: String`, `tokenExpiresAt: DateTime`, `createdAt`, `updatedAt`.이후 모든 태스크가 `prisma.threadsAccount.*`로 이 테이블을 쓴다.

- [ ] **Step 1: 스키마에 모델 추가**

`web/prisma/schema.prisma` 맨 끝(`model Inquiry { ... }` 다음)에 추가:

```prisma
// Threads Publishing API 연결 정보. 운영자가 한 명이라 항상 id="singleton" 행 하나만 존재한다.
model ThreadsAccount {
  id             String   @id @default("singleton")
  threadsUserId  String
  username       String?
  accessToken    String   @db.Text
  tokenExpiresAt DateTime

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Postgres가 떠 있는지 확인**

Run: `pnpm --dir web infra:up`
Expected: 이미 떠 있으면 그대로, 아니면 컨테이너가 시작된다.

- [ ] **Step 3: 마이그레이션 생성·적용**

Run: `pnpm --dir web db:migrate -- --name add_threads_account`
Expected: `web/prisma/migrations/<timestamp>_add_threads_account/migration.sql`이 새로 생기고, 로컬 DB에 `ThreadsAccount` 테이블이 만들어진다. Prisma Client도 함께 재생성된다.

- [ ] **Step 4: 타입 확인**

Run: `pnpm --dir web typecheck`
Expected: 에러 없이 통과 (아직 `ThreadsAccount`를 쓰는 코드가 없으므로 스키마 자체만 컴파일 확인).

- [ ] **Step 5: 커밋**

```bash
git add web/prisma/schema.prisma web/prisma/migrations
git commit -m "feat: ThreadsAccount 모델 추가"
```

---

## Task 2: `THREADS_APP_ID`/`THREADS_APP_SECRET`/`THREADS_REDIRECT_URI` 환경변수

**Files:**
- Modify: `web/src/lib/env.ts`
- Modify: `web/.env.example`
- Test: `web/tests/env.test.ts`

**Interfaces:**
- Produces: `Env.threadsAppId: string | null`, `Env.threadsAppSecret: string | null`, `Env.threadsRedirectUri: string | null` — Task 8/9의 라우트가 `getEnv()`로 읽는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`web/tests/env.test.ts` 끝(`describe('getEnv', …)` 블록 안, 마지막 `it` 다음)에 추가:

```ts
  it('THREADS_* 값이 없으면 null이고, 있으면 trim해서 읽는다', () => {
    expect(getEnv(full).threadsAppId).toBeNull();
    expect(getEnv(full).threadsAppSecret).toBeNull();
    expect(getEnv(full).threadsRedirectUri).toBeNull();
    const env = getEnv({
      ...full,
      THREADS_APP_ID: ' app123 ',
      THREADS_APP_SECRET: 'secret123',
      THREADS_REDIRECT_URI: 'https://example.com/api/admin/threads/callback',
    });
    expect(env.threadsAppId).toBe('app123');
    expect(env.threadsAppSecret).toBe('secret123');
    expect(env.threadsRedirectUri).toBe('https://example.com/api/admin/threads/callback');
  });

  // .env.example의 THREADS_APP_ID= 처럼 "키는 있지만 값이 빈 문자열"인 경우를 반드시
  // null로 취급해야 한다. min(1)만 걸면 빈 문자열이 optional()을 우회하지 못하고 그대로
  // getEnv() 전체를 던지게 만든다 — cp .env.example .env로 시작한 모든 로컬 개발이 즉시
  // 깨진다(기존 GCP_PROJECT_ID가 이미 이 함정에 빠져 있었다: 로컬에서 재현 확인함).
  it('THREADS_*가 빈 문자열이어도(.env.example 그대로) 예외 없이 null이다', () => {
    const env = getEnv({
      ...full,
      THREADS_APP_ID: '',
      THREADS_APP_SECRET: '',
      THREADS_REDIRECT_URI: '',
    });
    expect(env.threadsAppId).toBeNull();
    expect(env.threadsAppSecret).toBeNull();
    expect(env.threadsRedirectUri).toBeNull();
  });
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm --dir web test env.test.ts`
Expected: FAIL — `threadsAppId`/`threadsAppSecret`/`threadsRedirectUri`가 `Env` 타입에 없어 타입 에러 또는 `undefined`로 실패.

- [ ] **Step 3: 구현**

`web/src/lib/env.ts`의 `schema` 객체(`PHOTO_BUCKET` 다음)에 추가. `LLM_MODEL`과 똑같이 빈 문자열을 `undefined`로 먼저 걸러낸다 — 그냥 `z.string().trim().min(1).optional()`만 쓰면 "키는 있지만 값이 빈 문자열"(`.env.example`을 그대로 복사한 `.env`가 정확히 이 모양이다)일 때 `.optional()`을 타지 않고 `.min(1)`에서 걸려 `getEnv()` 전체가 예외를 던진다:

```ts
  // Threads Publishing API. 셋 다 없으면 연결 기능이 비활성(503).
  THREADS_APP_ID: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional()
  ),
  THREADS_APP_SECRET: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional()
  ),
  THREADS_REDIRECT_URI: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional()
  ),
```

`Env` 타입(`photoBucket: string | null;` 다음)에 추가:

```ts
  threadsAppId: string | null;
  threadsAppSecret: string | null;
  threadsRedirectUri: string | null;
```

`getEnv()` 본문, `const bucket = ...` 근처에 추가:

```ts
  const threadsAppId = v.THREADS_APP_ID?.trim() || '';
  const threadsAppSecret = v.THREADS_APP_SECRET?.trim() || '';
  const threadsRedirectUri = v.THREADS_REDIRECT_URI?.trim() || '';
```

반환 객체(`photoBucket: bucket || null,` 다음)에 추가:

```ts
    threadsAppId: threadsAppId || null,
    threadsAppSecret: threadsAppSecret || null,
    threadsRedirectUri: threadsRedirectUri || null,
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir web test env.test.ts`
Expected: PASS

- [ ] **Step 5: `.env.example` 갱신**

`web/.env.example` 끝(`# EXTENSION_CORS_ORIGINS=...` 다음)에 추가:

```
# Threads Publishing API. 셋 다 없으면 관리자 설정의 "Threads 연결"이 503을 준다.
# Meta for Developers에서 앱 생성 → "Threads API" 제품 추가 → redirect URI 등록 후 발급.
THREADS_APP_ID=
THREADS_APP_SECRET=
# Meta 앱에 등록한 것과 정확히 같은 값. 예: https://<도메인>/api/admin/threads/callback
THREADS_REDIRECT_URI=
```

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/env.ts web/.env.example web/tests/env.test.ts
git commit -m "feat: Threads 앱 자격증명 환경변수 추가"
```

---

## Task 3: `web/src/lib/threads/account.ts` — 토큰 저장소

**Files:**
- Create: `web/src/lib/threads/account.ts`
- Test: `web/tests/threads-account.test.ts`

**Interfaces:**
- Consumes: 없음 (Task 1의 `ThreadsAccount` 모델만 사용).
- Produces:
  - `type ThreadsAccountInfo = { threadsUserId: string; username: string | null; accessToken: string; tokenExpiresAt: Date }`
  - `getThreadsAccount(): Promise<ThreadsAccountInfo | null>`
  - `saveThreadsAccount(info: ThreadsAccountInfo): Promise<void>`
  - `updateThreadsAccessToken(accessToken: string, tokenExpiresAt: Date): Promise<void>`
  - `clearThreadsAccount(): Promise<void>`

  Task 6(`service.ts`)과 Task 8/9(설정 라우트들)이 이 다섯 개를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `web/tests/threads-account.test.ts`:

```ts
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
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm --dir web test threads-account.test.ts`
Expected: FAIL — `@/lib/threads/account` 모듈이 없어 import 에러.

- [ ] **Step 3: 구현**

Create `web/src/lib/threads/account.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir web test threads-account.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/threads/account.ts web/tests/threads-account.test.ts
git commit -m "feat: Threads 계정 토큰 저장소 추가"
```

---

## Task 4: `web/src/lib/threads/client.ts` — OAuth 교환

**Files:**
- Create: `web/src/lib/threads/client.ts`
- Test: `web/tests/threads-client.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 `fetch` 래퍼).
- Produces:
  - `class ThreadsApiError extends Error`
  - `buildAuthorizeUrl(args: { appId: string; redirectUri: string; state: string }): string`
  - `exchangeCodeForToken(args: { appId: string; appSecret: string; code: string; redirectUri: string }): Promise<{ accessToken: string; userId: string }>`
  - `exchangeForLongLivedToken(args: { appSecret: string; accessToken: string }): Promise<{ accessToken: string; expiresInSeconds: number }>`
  - `refreshLongLivedToken(args: { accessToken: string }): Promise<{ accessToken: string; expiresInSeconds: number }>`
  - `fetchThreadsUsername(args: { accessToken: string }): Promise<string | null>`

  Task 5가 같은 파일에 게시 함수를 추가한다. Task 6/8/9가 이 함수들을 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `web/tests/threads-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  fetchThreadsUsername,
  ThreadsApiError,
} from '@/lib/threads/client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildAuthorizeUrl', () => {
  it('client_id·redirect_uri·scope·state를 포함한 authorize URL을 만든다', () => {
    const url = buildAuthorizeUrl({
      appId: 'app123',
      redirectUri: 'https://example.com/api/admin/threads/callback',
      state: 'nonce-1',
    });
    expect(url).toContain('https://threads.net/oauth/authorize?');
    expect(url).toContain('client_id=app123');
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=nonce-1');
    expect(decodeURIComponent(url)).toContain('scope=threads_basic,threads_content_publish');
    expect(decodeURIComponent(url)).toContain(
      'redirect_uri=https://example.com/api/admin/threads/callback'
    );
  });
});

describe('exchangeCodeForToken', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('성공하면 access token과 user id를 돌려준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'short-token', user_id: 17841405793187218 }));
    const result = await exchangeCodeForToken({
      appId: 'app123',
      appSecret: 'secret123',
      code: 'auth-code',
      redirectUri: 'https://example.com/callback',
    });
    expect(result).toEqual({ accessToken: 'short-token', userId: '17841405793187218' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.threads.net/oauth/access_token',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('실패하면 Threads의 error_message를 담아 ThreadsApiError를 던진다', async () => {
    // mockResolvedValue는 Response 인스턴스를 한 번만 만들어 매 호출에 재사용하는데, Response
    // body는 한 번만 읽을 수 있다. 아래에서 exchangeCodeForToken을 두 번 호출하므로
    // mockImplementation으로 매 호출마다 새 Response를 만들어야 두 번째 호출도 body를 읽을 수 있다.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { error_type: 'OAuthException', code: 400, error_message: '이미 사용된 코드입니다.' },
          400
        )
      )
    );
    await expect(
      exchangeCodeForToken({
        appId: 'app123',
        appSecret: 'secret123',
        code: 'used-code',
        redirectUri: 'https://example.com/callback',
      })
    ).rejects.toThrow(ThreadsApiError);
    await expect(
      exchangeCodeForToken({
        appId: 'app123',
        appSecret: 'secret123',
        code: 'used-code',
        redirectUri: 'https://example.com/callback',
      })
    ).rejects.toThrow('이미 사용된 코드입니다.');
  });
});

describe('exchangeForLongLivedToken', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('장기 토큰과 만료 초를 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'long-token', token_type: 'bearer', expires_in: 5183944 })
    );
    const result = await exchangeForLongLivedToken({ appSecret: 'secret123', accessToken: 'short-token' });
    expect(result).toEqual({ accessToken: 'long-token', expiresInSeconds: 5183944 });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('https://graph.threads.net/access_token?');
    expect(calledUrl).toContain('grant_type=th_exchange_token');
  });
});

describe('refreshLongLivedToken', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('갱신된 토큰과 만료 초를 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'refreshed-token', token_type: 'bearer', expires_in: 5183944 })
    );
    const result = await refreshLongLivedToken({ accessToken: 'long-token' });
    expect(result).toEqual({ accessToken: 'refreshed-token', expiresInSeconds: 5183944 });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('https://graph.threads.net/refresh_access_token?');
    expect(calledUrl).toContain('grant_type=th_refresh_token');
  });
});

describe('fetchThreadsUsername', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('username을 돌려준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '17841405793187218', username: 'threadsapitestuser' }));
    expect(await fetchThreadsUsername({ accessToken: 'long-token' })).toBe('threadsapitestuser');
  });

  it('username이 없으면 null', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '17841405793187218' }));
    expect(await fetchThreadsUsername({ accessToken: 'long-token' })).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm --dir web test threads-client.test.ts`
Expected: FAIL — `@/lib/threads/client` 모듈이 없어 import 에러.

- [ ] **Step 3: 구현**

Create `web/src/lib/threads/client.ts`:

```ts
export class ThreadsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThreadsApiError';
  }
}

const REQUEST_TIMEOUT_MS = 10_000;
const SCOPES = 'threads_basic,threads_content_publish';

function threadsErrorMessage(data: Record<string, unknown>, status: number): string {
  if (typeof data.error_message === 'string') return data.error_message;
  const error = data.error as { message?: string } | undefined;
  if (error && typeof error.message === 'string') return error.message;
  return `Threads API 오류 (HTTP ${status})`;
}

async function parseJsonOrThrow(response: Response): Promise<Record<string, unknown>> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new ThreadsApiError(threadsErrorMessage(data, response.status));
  return data;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return parseJsonOrThrow(response);
}

async function postJson(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseJsonOrThrow(response);
}

export function buildAuthorizeUrl(args: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL('https://threads.net/oauth/authorize');
  url.searchParams.set('client_id', args.appId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', args.state);
  return url.toString();
}

// 이 엔드포인트만 JSON body를 받는다(나머지는 query string) — Meta 공식 문서의 요청 예시가
// 그렇게 되어 있다.
export async function exchangeCodeForToken(args: {
  appId: string;
  appSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; userId: string }> {
  const data = await postJson('https://graph.threads.net/oauth/access_token', {
    client_id: args.appId,
    client_secret: args.appSecret,
    code: args.code,
    grant_type: 'authorization_code',
    redirect_uri: args.redirectUri,
  });
  return { accessToken: String(data.access_token), userId: String(data.user_id) };
}

export async function exchangeForLongLivedToken(args: {
  appSecret: string;
  accessToken: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL('https://graph.threads.net/access_token');
  url.searchParams.set('grant_type', 'th_exchange_token');
  url.searchParams.set('client_secret', args.appSecret);
  url.searchParams.set('access_token', args.accessToken);
  const data = await getJson(url.toString());
  return { accessToken: String(data.access_token), expiresInSeconds: Number(data.expires_in) };
}

export async function refreshLongLivedToken(args: {
  accessToken: string;
}): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const url = new URL('https://graph.threads.net/refresh_access_token');
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', args.accessToken);
  const data = await getJson(url.toString());
  return { accessToken: String(data.access_token), expiresInSeconds: Number(data.expires_in) };
}

export async function fetchThreadsUsername(args: { accessToken: string }): Promise<string | null> {
  const url = new URL('https://graph.threads.net/v1.0/me');
  url.searchParams.set('fields', 'username');
  url.searchParams.set('access_token', args.accessToken);
  const data = await getJson(url.toString());
  return typeof data.username === 'string' ? data.username : null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir web test threads-client.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/threads/client.ts web/tests/threads-client.test.ts
git commit -m "feat: Threads OAuth 토큰 교환 클라이언트 추가"
```

---

## Task 5: `web/src/lib/threads/client.ts` — 게시(container→publish)

**Files:**
- Modify: `web/src/lib/threads/client.ts`
- Modify: `web/tests/threads-client.test.ts`

**Interfaces:**
- Consumes: Task 4의 `ThreadsApiError`, `postJson`/`getJson`(파일 내부 private 헬퍼 재사용).
- Produces: `publishThreadsPost(args: { accessToken: string; threadsUserId: string; text: string }): Promise<string>` — Task 6(`service.ts`)이 이 함수를 `publishText` deps의 기본값으로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`web/tests/threads-client.test.ts` 맨 위 import에 `publishThreadsPost` 추가:

```ts
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  fetchThreadsUsername,
  publishThreadsPost,
  ThreadsApiError,
} from '@/lib/threads/client';
```

파일 끝에 추가:

```ts
describe('publishThreadsPost', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('container 생성 후 즉시 publish가 성공하면 post id를 돌려준다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' })) // POST /threads
      .mockResolvedValueOnce(jsonResponse({ id: 'post-1' })); // POST /threads_publish

    const postId = await publishThreadsPost({
      accessToken: 'token',
      threadsUserId: 'u1',
      text: '✨ 본문',
    });

    expect(postId).toBe('post-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://graph.threads.net/v1.0/u1/threads');
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://graph.threads.net/v1.0/u1/threads_publish'
    );
  });

  it('publish가 아직 준비 안 됐으면(IN_PROGRESS) 상태를 확인하고 재시도한다', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' })) // container 생성
      .mockResolvedValueOnce(jsonResponse({ error: { message: '아직 처리 중' } }, 400)) // 1차 publish 실패
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS', id: 'container-1' })) // 상태 확인
      .mockResolvedValueOnce(jsonResponse({ id: 'post-1' })); // 2차 publish 성공

    const promise = publishThreadsPost({ accessToken: 'token', threadsUserId: 'u1', text: '✨ 본문' });
    await vi.advanceTimersByTimeAsync(3_000);
    const postId = await promise;

    expect(postId).toBe('post-1');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('container 상태가 ERROR면 그 error_message로 ThreadsApiError를 던진다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: '실패' } }, 400))
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ERROR', id: 'container-1', error_message: 'FAILED_PROCESSING' })
      );

    await expect(
      publishThreadsPost({ accessToken: 'token', threadsUserId: 'u1', text: '✨ 본문' })
    ).rejects.toThrow('FAILED_PROCESSING');
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm --dir web test threads-client.test.ts`
Expected: FAIL — `publishThreadsPost`가 없어 import 에러.

- [ ] **Step 3: 구현**

`web/src/lib/threads/client.ts` 끝에 추가:

```ts
// container→publish 사이 공식 권장 대기(30초)는 텍스트 전용에는 과하다 — 미디어 다운로드가
// 없어 대개 즉시 끝난다. 그래서 먼저 즉시 publish를 시도하고, 실패했을 때만 상태를 확인해
// 짧게 재시도한다. 폴링 간격·횟수는 troubleshooting 문서의 상태값(IN_PROGRESS/ERROR/EXPIRED/
// FINISHED/PUBLISHED)을 그대로 따른다.
const PUBLISH_POLL_DELAY_MS = 3_000;
const MAX_PUBLISH_ATTEMPTS = 3;

async function postForm(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseJsonOrThrow(response);
}

async function createTextContainer(args: {
  accessToken: string;
  threadsUserId: string;
  text: string;
}): Promise<string> {
  const data = await postForm(`https://graph.threads.net/v1.0/${args.threadsUserId}/threads`, {
    media_type: 'TEXT',
    text: args.text,
    access_token: args.accessToken,
  });
  return String(data.id);
}

async function tryPublish(args: {
  accessToken: string;
  threadsUserId: string;
  creationId: string;
}): Promise<string | null> {
  try {
    const data = await postForm(
      `https://graph.threads.net/v1.0/${args.threadsUserId}/threads_publish`,
      { creation_id: args.creationId, access_token: args.accessToken }
    );
    return String(data.id);
  } catch (error) {
    if (error instanceof ThreadsApiError) return null;
    throw error;
  }
}

async function containerStatus(args: {
  accessToken: string;
  creationId: string;
}): Promise<{ status: string; errorMessage: string | null }> {
  const url = new URL(`https://graph.threads.net/v1.0/${args.creationId}`);
  url.searchParams.set('fields', 'status,error_message');
  url.searchParams.set('access_token', args.accessToken);
  const data = await getJson(url.toString());
  return {
    status: String(data.status ?? ''),
    errorMessage: typeof data.error_message === 'string' ? data.error_message : null,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishThreadsPost(args: {
  accessToken: string;
  threadsUserId: string;
  text: string;
}): Promise<string> {
  const creationId = await createTextContainer(args);

  for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
    const postId = await tryPublish({ ...args, creationId });
    if (postId) return postId;

    const status = await containerStatus({ accessToken: args.accessToken, creationId });
    if (status.status === 'ERROR' || status.status === 'EXPIRED') {
      throw new ThreadsApiError(status.errorMessage ?? 'Threads 게시에 실패했습니다.');
    }
    if (attempt < MAX_PUBLISH_ATTEMPTS) await delay(PUBLISH_POLL_DELAY_MS);
  }
  throw new ThreadsApiError('Threads 게시가 시간 내에 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir web test threads-client.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/threads/client.ts web/tests/threads-client.test.ts
git commit -m "feat: Threads 텍스트 게시(container→publish, 재시도) 추가"
```

---

## Task 6: `service.ts` — `markPublished` → `publishToThreads`

**Files:**
- Modify: `web/src/lib/profile/service.ts`
- Rename+rewrite: `web/tests/publish-mark.test.ts` → `web/tests/publish.test.ts`

**Interfaces:**
- Consumes: Task 3의 `getThreadsAccount`/`updateThreadsAccessToken`, Task 4/5의 `refreshLongLivedToken`/`publishThreadsPost`/`ThreadsApiError`, Task 3의 `ThreadsAccountInfo` 타입.
- Produces: `publishToThreads(id: string, deps?: PublishDeps): Promise<PublishResult>` — Task 7의 라우트가 이 함수 하나만 호출한다.

- [ ] **Step 1: 테스트 파일 이동 후 markPublished 관련 테스트를 새 테스트로 교체**

```bash
git mv web/tests/publish-mark.test.ts web/tests/publish.test.ts
```

`web/tests/publish.test.ts`의 맨 위부터 `describe('deletePhoto', ...)`가 시작되기 전까지(즉 import문·`fakeProfile` 헬퍼·`describe('markPublished', ...)` 블록 전체)를 아래 내용으로 통째로 교체한다. `describe('deletePhoto', ...)` 블록은 파일 뒤쪽에 그대로 남겨둔다(손대지 않는다):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishToThreads, deletePhoto } from '@/lib/profile/service';
import { ThreadsApiError } from '@/lib/threads/client';
import type { Profile, Status } from '@prisma/client';
import type { ThreadsAccountInfo } from '@/lib/threads/account';

function fakeProfile(partial: Partial<Profile> & { id: string; status: Status }): Profile {
  return {
    seq: null,
    sourceHandle: 'x',
    rawText: 'raw',
    gender: null,
    birthYear: null,
    region: null,
    heightCm: null,
    job: null,
    hobbies: [],
    appealPoints: [],
    idealType: [],
    partnerBirthYearMin: null,
    partnerBirthYearMax: null,
    partnerRegions: [],
    dealBreakers: [],
    draftBody: null,
    finalBody: '✨ 본문',
    publishedPostId: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function fakeAccount(partial: Partial<ThreadsAccountInfo> = {}): ThreadsAccountInfo {
  return {
    threadsUserId: 'u1',
    username: 'handle',
    accessToken: 'token',
    tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...partial,
  };
}

describe('publishToThreads', () => {
  it('APPROVED이면 게시하고 PUBLISHED로 올려 seq·postId를 남긴다', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      publishText: async () => 'post-123',
      commit: async () =>
        fakeProfile({
          id: 'p1',
          status: 'PUBLISHED',
          seq: 7,
          finalBody: '✨ 본문',
          publishedAt: new Date(),
          publishedPostId: 'post-123',
        }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.status).toBe('PUBLISHED');
      expect(result.profile.seq).toBe(7);
      expect(result.profile.publishedPostId).toBe('post-123');
    }
  });

  it('승인 전이면 400이고 Threads를 호출하지 않는다', async () => {
    const publishText = vi.fn();
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'DRAFTED', finalBody: '✨ 본문' }),
      publishText,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(publishText).not.toHaveBeenCalled();
  });

  it('없으면 404', async () => {
    const result = await publishToThreads('missing', { find: async () => null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it('Threads 연결이 없으면 400', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/연결/);
    }
  });

  it('토큰이 만료됐으면 400', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => {
        throw new Error('만료');
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/다시 연결/);
    }
  });

  it('Threads API 호출이 실패하면 502이고 오류 메시지를 그대로 전달한다', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      publishText: async () => {
        throw new ThreadsApiError('일일 게시 한도를 초과했습니다.');
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toBe('일일 게시 한도를 초과했습니다.');
    }
  });

  it('게시는 성공했지만 DB 반영이 쓰기 경쟁으로 실패하면 post id를 담아 409를 준다', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      publishText: async () => 'post-999',
      commit: async () => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/post-999/);
    }
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm --dir web test publish.test.ts`
Expected: FAIL — `publishToThreads`가 `service.ts`에 없어 import 에러.

- [ ] **Step 3: 구현**

`web/src/lib/profile/service.ts` 맨 위 import를 교체:

```ts
import { removePhoto } from '@/lib/storage';
import { canPublish } from '@/lib/profile/state';
import { getThreadsAccount, updateThreadsAccessToken } from '@/lib/threads/account';
import { refreshLongLivedToken, publishThreadsPost, ThreadsApiError } from '@/lib/threads/client';
import type { ThreadsAccountInfo } from '@/lib/threads/account';
import type { Profile, Status } from '@prisma/client';
```

`export type MarkPublishedResult = ...`부터 `export async function markPublished(...) { ... }` 끝까지 — 즉 `export type DeletePhotoDeps = ...`가 시작되기 바로 전까지 — 전체를 아래로 교체 (`DeletePhotoDeps`와 `deletePhoto` 함수는 그대로 둔다):

```ts
export type PublishResult =
  | { ok: true; profile: Profile }
  | { ok: false; status: 400 | 404 | 409 | 502; error: string };

export type PublishDeps = {
  find?: (id: string) => Promise<{ id: string; status: Status; finalBody: string | null } | null>;
  getAccount?: () => Promise<ThreadsAccountInfo | null>;
  ensureFreshToken?: (account: ThreadsAccountInfo) => Promise<string>;
  publishText?: (args: { accessToken: string; threadsUserId: string; text: string }) => Promise<string>;
  beforeWrite?: () => void | Promise<void>;
  commit?: (args: {
    id: string;
    expectedStatus: Status;
    expectedFinalBody: string | null;
    publishedPostId: string;
  }) => Promise<Profile | null>;
};

// 만료 7일 이내면 미리 갱신한다. 갱신 자체가 실패해도(네트워크 등) 아직 만료 전이면 기존
// 토큰으로 계속 진행한다 — Threads 장기 토큰은 "만료 전"에만 갱신 가능하므로, 이미 만료된
// 경우에만 진짜 에러로 취급한다.
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function defaultEnsureFreshToken(account: ThreadsAccountInfo): Promise<string> {
  const now = Date.now();
  if (account.tokenExpiresAt.getTime() <= now) {
    throw new Error('Threads 토큰이 만료되었습니다.');
  }
  if (account.tokenExpiresAt.getTime() - now > REFRESH_WINDOW_MS) {
    return account.accessToken;
  }
  try {
    const refreshed = await refreshLongLivedToken({ accessToken: account.accessToken });
    const expiresAt = new Date(now + refreshed.expiresInSeconds * 1000);
    await updateThreadsAccessToken(refreshed.accessToken, expiresAt);
    return refreshed.accessToken;
  } catch (error) {
    console.warn('[threads] 토큰 갱신 실패, 기존 토큰으로 계속', error);
    return account.accessToken;
  }
}

/**
 * 승인된 프로필을 Threads Publishing API로 게시하고 그 결과를 기록한다.
 * seq는 게시 시점에 발급한다(미리 발급하지 않음).
 */
export async function publishToThreads(id: string, deps: PublishDeps = {}): Promise<PublishResult> {
  const find =
    deps.find ??
    (async (profileId: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.profile.findUnique({
        where: { id: profileId },
        select: { id: true, status: true, finalBody: true },
      });
    });

  const profile = await find(id);
  if (!profile) return { ok: false, status: 404, error: '없는 프로필입니다.' };

  const check = canPublish(profile);
  if (!check.ok) return { ok: false, status: 400, error: check.reason };

  const getAccount = deps.getAccount ?? getThreadsAccount;
  const account = await getAccount();
  if (!account) {
    return { ok: false, status: 400, error: 'Threads 연결이 필요합니다. 설정에서 연결해 주세요.' };
  }

  const ensureFreshToken = deps.ensureFreshToken ?? defaultEnsureFreshToken;
  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(account);
  } catch {
    return { ok: false, status: 400, error: 'Threads 연결이 만료됐습니다. 설정에서 다시 연결해 주세요.' };
  }

  const publishText = deps.publishText ?? publishThreadsPost;
  let publishedPostId: string;
  try {
    publishedPostId = await publishText({
      accessToken,
      threadsUserId: account.threadsUserId,
      text: profile.finalBody ?? '',
    });
  } catch (error) {
    const message = error instanceof ThreadsApiError ? error.message : 'Threads 게시에 실패했습니다.';
    return { ok: false, status: 502, error: message };
  }

  await deps.beforeWrite?.();

  const commit =
    deps.commit ??
    (async ({ id: profileId, expectedStatus, expectedFinalBody, publishedPostId: postId }) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.$transaction(async (tx) => {
        const max = await tx.profile.aggregate({ _max: { seq: true } });
        const nextSeq = (max._max.seq ?? 0) + 1;
        const result = await tx.profile.updateMany({
          where: { id: profileId, status: expectedStatus, finalBody: expectedFinalBody },
          data: { status: 'PUBLISHED', publishedAt: new Date(), seq: nextSeq, publishedPostId: postId },
        });
        if (result.count === 0) return null;
        return tx.profile.findUniqueOrThrow({ where: { id: profileId } });
      });
    });

  const updated = await commit({
    id,
    expectedStatus: profile.status,
    expectedFinalBody: profile.finalBody,
    publishedPostId,
  });
  if (!updated) {
    return {
      ok: false,
      status: 409,
      error: `게시는 완료됐지만(Threads post id: ${publishedPostId}) 프로필이 그 사이 변경되어 상태를 반영하지 못했습니다. 직접 확인해 주세요.`,
    };
  }
  return { ok: true, profile: updated };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir web test publish.test.ts`
Expected: PASS (7 + 기존 `deletePhoto` 3개 = 10 tests)

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/profile/service.ts web/tests/publish.test.ts
git commit -m "feat: markPublished를 Threads API 게시(publishToThreads)로 대체"
```

---

## Task 7: `/api/profiles/[id]/publish` 라우트, 기존 `publish-mark` 제거, e2e 갱신

**Files:**
- Create: `web/src/app/api/profiles/[id]/publish/route.ts`
- Delete: `web/src/app/api/profiles/[id]/publish-mark/` (디렉터리 전체)
- Modify: `web/e2e/api-flow.spec.ts`

**Interfaces:**
- Consumes: Task 6의 `publishToThreads`.
- Produces: `POST /api/profiles/[id]/publish` — Task 10의 `editor.tsx`가 이 경로를 호출한다.

- [ ] **Step 1: 새 라우트 작성**

Create `web/src/app/api/profiles/[id]/publish/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { publishToThreads } from '@/lib/profile/service';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const result = await publishToThreads(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ profile: result.profile });
}
```

- [ ] **Step 2: 기존 라우트 삭제**

```bash
rm -rf "web/src/app/api/profiles/[id]/publish-mark"
```

- [ ] **Step 3: e2e 스펙을 새 라우트에 맞게 갱신**

`web/e2e/api-flow.spec.ts`의 `test('신규 프로필 extract→compose→approve→publish-mark (mock LLM)', ...)` 블록 전체를 아래로 교체 (테스트 제목과 마지막 두 줄만 바뀐다):

```ts
  test('신규 프로필 extract→compose→approve→publish (Threads 미연결이면 400)', async ({ request }) => {
    const api = ops(request);
    const handle = `e2e_${Date.now()}`;
    const rawText = [
      '안녕하세요 여성 01년생입니다.',
      '서울 동작 거주, 163cm, 디자이너입니다.',
      '취미는 카페, 영화.',
      '이상형은 유머 있고 성실한 사람.',
      '97년생~05년생, 서울/경기 희망. 흡연 절대 안 됨.',
    ].join('\n');

    const created = await api.post('/api/profiles', { sourceHandle: handle, rawText });
    expect(created.status(), await created.text()).toBe(201);
    const { profile } = await created.json();

    const extract = await api.post(`/api/profiles/${profile.id}/extract`);
    expect(extract.status(), await extract.text()).toBe(200);
    const extracted = await extract.json();
    expect(extracted.profile.gender).toBe('F');
    expect(extracted.profile.birthYear).toBeTruthy();

    const compose = await api.post(`/api/profiles/${profile.id}/compose`);
    expect(compose.status(), await compose.text()).toBe(200);
    const composed = await compose.json();
    expect(composed.profile.finalBody).toContain('✨');
    expect(composed.profile.finalBody).toContain('📨 관심 있으신 분은 메세지 주세요!');

    const approve = await api.post(`/api/profiles/${profile.id}/approve`);
    expect(approve.status(), await approve.text()).toBe(200);

    // e2e 환경에는 Threads 연결(ThreadsAccount)이 없다 — OAuth는 실제 브라우저 왕복이 필요해
    // 로컬/CI에서 재현할 수 없다(설계 문서 §3/§9). 연결이 없을 때 명확한 400을 주는지만 본다.
    const publish = await api.post(`/api/profiles/${profile.id}/publish`);
    expect(publish.status(), await publish.text()).toBe(400);
    const body = await publish.json();
    expect(body.error).toMatch(/연결/);
  });
```

- [ ] **Step 4: 타입 확인**

Run: `pnpm --dir web typecheck`
Expected: 에러 없이 통과.

- [ ] **Step 5: 커밋**

```bash
git add web/src/app/api/profiles web/e2e/api-flow.spec.ts
git commit -m "feat: publish-mark를 실제 Threads 게시 라우트로 대체"
```

---

## Task 8: Threads 연결 설정 라우트 — `connect`/`status`/`disconnect`

**Files:**
- Create: `web/src/lib/threads/state-cookie.ts`
- Create: `web/src/app/api/admin/threads/connect/route.ts`
- Create: `web/src/app/api/admin/threads/status/route.ts`
- Create: `web/src/app/api/admin/threads/disconnect/route.ts`
- Test: `web/tests/threads-settings-routes.test.ts`

**Interfaces:**
- Consumes: Task 2의 `getEnv()`(`threadsAppId`/`threadsRedirectUri`), Task 3의 `getThreadsAccount`/`clearThreadsAccount`, Task 4의 `buildAuthorizeUrl`.
- Produces: `THREADS_OAUTH_STATE_COOKIE: string` 상수 — Task 9의 콜백 라우트가 같은 상수를 가져다 쓴다. `GET /api/admin/threads/connect`(Task 10의 "Threads 연결" 버튼이 브라우저 이동으로 호출), `POST /api/admin/threads/disconnect`(Task 10의 "연결 해제" 버튼이 호출). `GET /api/admin/threads/status`는 `GET /api/admin/llm-settings`와 같은 성격의 일반 조회 라우트다 — Task 10의 설정 페이지는 이 라우트를 거치지 않고 `getThreadsAccount()`를 서버 컴포넌트에서 직접 호출한다(기존 `page.tsx`가 `getLlmConfig()`를 직접 호출하는 것과 동일한 패턴이며, 페이지 자체 렌더링에 라우트 왕복이 필요 없다). `status` 라우트는 Bearer 토큰을 쓰는 외부 클라이언트(확장 프로그램 등)를 위한 조회 창구로 남긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

Create `web/tests/threads-settings-routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { THREADS_OAUTH_STATE_COOKIE } from '@/lib/threads/state-cookie';

vi.mock('@/lib/env', () => ({ getEnv: vi.fn() }));
vi.mock('@/lib/threads/account', () => ({
  getThreadsAccount: vi.fn(),
  clearThreadsAccount: vi.fn(),
}));

describe('GET /api/admin/threads/connect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('앱 설정이 없으면 503', async () => {
    const { getEnv } = await import('@/lib/env');
    (getEnv as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      threadsAppId: null,
      threadsRedirectUri: null,
    });
    const { GET } = await import('@/app/api/admin/threads/connect/route');
    const response = await GET();
    expect(response.status).toBe(503);
  });

  it('앱 설정이 있으면 authorize URL로 리다이렉트하고 state 쿠키를 심는다', async () => {
    const { getEnv } = await import('@/lib/env');
    (getEnv as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      threadsAppId: 'app123',
      threadsRedirectUri: 'https://example.com/api/admin/threads/callback',
    });
    const { GET } = await import('@/app/api/admin/threads/connect/route');
    const response = await GET();
    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('https://threads.net/oauth/authorize');
    expect(location).toContain('client_id=app123');
    const stateCookie = response.cookies.get(THREADS_OAUTH_STATE_COOKIE);
    expect(stateCookie?.value).toBeTruthy();
  });
});

describe('GET /api/admin/threads/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('연결 안 됐으면 connected: false만 준다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import('@/app/api/admin/threads/status/route');
    const response = await GET();
    expect(await response.json()).toEqual({ connected: false });
  });

  it('연결됐으면 username·만료일을 주고 토큰 원문은 절대 안 준다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      threadsUserId: 'u1',
      username: 'handle',
      accessToken: 'super-secret-token',
      tokenExpiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    const { GET } = await import('@/app/api/admin/threads/status/route');
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual({
      connected: true,
      username: 'handle',
      tokenExpiresAt: '2026-10-01T00:00:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('super-secret-token');
  });
});

describe('POST /api/admin/threads/disconnect', () => {
  it('저장된 연결을 지운다', async () => {
    const { clearThreadsAccount } = await import('@/lib/threads/account');
    const { POST } = await import('@/app/api/admin/threads/disconnect/route');
    const response = await POST();
    expect(response.status).toBe(200);
    expect(clearThreadsAccount).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm --dir web test threads-settings-routes.test.ts`
Expected: FAIL — 라우트/상수 모듈이 없어 import 에러.

- [ ] **Step 3: 구현**

Create `web/src/lib/threads/state-cookie.ts`:

```ts
// connect가 심고 callback이 검증하는 CSRF state 쿠키 이름. 두 라우트가 리터럴로 각자
// 따로 적어두면 하나만 바뀌었을 때 조용히 어긋난다 — 상수 하나로 공유한다.
export const THREADS_OAUTH_STATE_COOKIE = 'threads_oauth_state';
```

Create `web/src/app/api/admin/threads/connect/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { buildAuthorizeUrl } from '@/lib/threads/client';
import { THREADS_OAUTH_STATE_COOKIE } from '@/lib/threads/state-cookie';

export async function GET() {
  const env = getEnv();
  if (!env.threadsAppId || !env.threadsRedirectUri) {
    return NextResponse.json(
      { error: 'THREADS_APP_ID/THREADS_REDIRECT_URI가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }
  const state = crypto.randomUUID();
  const url = buildAuthorizeUrl({
    appId: env.threadsAppId,
    redirectUri: env.threadsRedirectUri,
    state,
  });
  const response = NextResponse.redirect(url);
  response.cookies.set(THREADS_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return response;
}
```

Create `web/src/app/api/admin/threads/status/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getThreadsAccount } from '@/lib/threads/account';

export async function GET() {
  const account = await getThreadsAccount();
  if (!account) return NextResponse.json({ connected: false });
  return NextResponse.json({
    connected: true,
    username: account.username,
    tokenExpiresAt: account.tokenExpiresAt.toISOString(),
  });
}
```

Create `web/src/app/api/admin/threads/disconnect/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { clearThreadsAccount } from '@/lib/threads/account';

export async function POST() {
  await clearThreadsAccount();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir web test threads-settings-routes.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/threads/state-cookie.ts web/src/app/api/admin/threads web/tests/threads-settings-routes.test.ts
git commit -m "feat: Threads 연결 상태 조회·해제 라우트 추가"
```

---

## Task 9: Threads OAuth 콜백 라우트

**Files:**
- Create: `web/src/app/api/admin/threads/callback/route.ts`
- Test: `web/tests/threads-callback.test.ts`

**Interfaces:**
- Consumes: Task 8의 `THREADS_OAUTH_STATE_COOKIE`, Task 2의 `getEnv()`, Task 4의 `exchangeCodeForToken`/`exchangeForLongLivedToken`/`fetchThreadsUsername`, Task 3의 `saveThreadsAccount`.
- Produces: `GET /api/admin/threads/callback` — Meta가 리다이렉트로 호출하는 종단점. 이 라우트를 직접 호출하는 다른 코드는 없다(브라우저 리다이렉트로만 도달).

- [ ] **Step 1: 실패하는 테스트 작성**

Create `web/tests/threads-callback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { THREADS_OAUTH_STATE_COOKIE } from '@/lib/threads/state-cookie';

vi.mock('@/lib/env', () => ({ getEnv: vi.fn() }));
vi.mock('@/lib/threads/client', () => ({
  exchangeCodeForToken: vi.fn(),
  exchangeForLongLivedToken: vi.fn(),
  fetchThreadsUsername: vi.fn(),
}));
vi.mock('@/lib/threads/account', () => ({ saveThreadsAccount: vi.fn() }));

function callbackRequest(query: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/threads/callback${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe('GET /api/admin/threads/callback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('state가 쿠키와 다르면 400이고 아무 것도 저장하지 않는다', async () => {
    const { saveThreadsAccount } = await import('@/lib/threads/account');
    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=wrong', `${THREADS_OAUTH_STATE_COOKIE}=expected`);
    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(saveThreadsAccount).not.toHaveBeenCalled();
  });

  it('state 쿠키가 없으면 400', async () => {
    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=expected');
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('앱 설정이 없으면 503', async () => {
    const { getEnv } = await import('@/lib/env');
    (getEnv as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      threadsAppId: null,
      threadsAppSecret: null,
      threadsRedirectUri: null,
    });
    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=expected', `${THREADS_OAUTH_STATE_COOKIE}=expected`);
    const response = await GET(request);
    expect(response.status).toBe(503);
  });

  it('교환에 성공하면 계정을 저장하고 설정 화면으로 리다이렉트한다', async () => {
    const { getEnv } = await import('@/lib/env');
    (getEnv as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      threadsAppId: 'app123',
      threadsAppSecret: 'secret123',
      threadsRedirectUri: 'https://example.com/api/admin/threads/callback',
    });
    const { exchangeCodeForToken, exchangeForLongLivedToken, fetchThreadsUsername } = await import(
      '@/lib/threads/client'
    );
    (exchangeCodeForToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'short',
      userId: 'u1',
    });
    (exchangeForLongLivedToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'long',
      expiresInSeconds: 5_183_944,
    });
    (fetchThreadsUsername as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('handle');
    const { saveThreadsAccount } = await import('@/lib/threads/account');

    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=expected', `${THREADS_OAUTH_STATE_COOKIE}=expected`);
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/admin/settings?threadsConnected=1');
    expect(saveThreadsAccount).toHaveBeenCalledWith(
      expect.objectContaining({ threadsUserId: 'u1', username: 'handle', accessToken: 'long' })
    );
  });

  it('교환이 실패하면 오류 메시지를 담아 설정 화면으로 리다이렉트하고 저장하지 않는다', async () => {
    const { getEnv } = await import('@/lib/env');
    (getEnv as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      threadsAppId: 'app123',
      threadsAppSecret: 'secret123',
      threadsRedirectUri: 'https://example.com/api/admin/threads/callback',
    });
    const { exchangeCodeForToken } = await import('@/lib/threads/client');
    (exchangeCodeForToken as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('코드가 이미 사용됐습니다.')
    );
    const { saveThreadsAccount } = await import('@/lib/threads/account');

    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=expected', `${THREADS_OAUTH_STATE_COOKIE}=expected`);
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('threadsError=');
    expect(saveThreadsAccount).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `pnpm --dir web test threads-callback.test.ts`
Expected: FAIL — 라우트 모듈이 없어 import 에러.

- [ ] **Step 3: 구현**

Create `web/src/app/api/admin/threads/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchThreadsUsername } from '@/lib/threads/client';
import { saveThreadsAccount } from '@/lib/threads/account';
import { THREADS_OAUTH_STATE_COOKIE } from '@/lib/threads/state-cookie';

function withClearedStateCookie(response: NextResponse): NextResponse {
  response.cookies.delete(THREADS_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(THREADS_OAUTH_STATE_COOKIE)?.value ?? '';

  if (!code || !state || !expectedState || state !== expectedState) {
    return withClearedStateCookie(
      NextResponse.json({ error: 'state 값이 일치하지 않습니다. 다시 시도해 주세요.' }, { status: 400 })
    );
  }

  const env = getEnv();
  if (!env.threadsAppId || !env.threadsAppSecret || !env.threadsRedirectUri) {
    return withClearedStateCookie(
      NextResponse.json({ error: 'Threads 앱 설정이 없습니다.' }, { status: 503 })
    );
  }

  try {
    const shortLived = await exchangeCodeForToken({
      appId: env.threadsAppId,
      appSecret: env.threadsAppSecret,
      code,
      redirectUri: env.threadsRedirectUri,
    });
    const longLived = await exchangeForLongLivedToken({
      appSecret: env.threadsAppSecret,
      accessToken: shortLived.accessToken,
    });
    const username = await fetchThreadsUsername({ accessToken: longLived.accessToken }).catch(
      () => null
    );
    await saveThreadsAccount({
      threadsUserId: shortLived.userId,
      username,
      accessToken: longLived.accessToken,
      tokenExpiresAt: new Date(Date.now() + longLived.expiresInSeconds * 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Threads 연결에 실패했습니다.';
    return withClearedStateCookie(
      NextResponse.redirect(
        new URL(`/admin/settings?threadsError=${encodeURIComponent(message)}`, request.url)
      )
    );
  }

  return withClearedStateCookie(
    NextResponse.redirect(new URL('/admin/settings?threadsConnected=1', request.url))
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --dir web test threads-callback.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add web/src/app/api/admin/threads/callback web/tests/threads-callback.test.ts
git commit -m "feat: Threads OAuth 콜백 라우트 추가"
```

---

## Task 10: UI — 게시 버튼 교체, 설정 화면 Threads 연동, 문서 갱신

**Files:**
- Modify: `web/src/app/admin/profiles/[id]/editor.tsx`
- Create: `web/src/app/admin/settings/threads-settings.tsx`
- Modify: `web/src/app/admin/settings/page.tsx`
- Modify: `web/README.md`

**Interfaces:**
- Consumes: Task 7의 `POST /api/profiles/[id]/publish`, Task 8의 `GET /api/admin/threads/status`(서버 컴포넌트에서는 `getThreadsAccount` 직접 호출)·`GET /api/admin/threads/connect`·`POST /api/admin/threads/disconnect`.
- Produces: 없음 (최종 사용자 화면). 이 태스크에는 단위 테스트가 없다 — `editor.tsx`/`settings-form.tsx`는 이 코드베이스에 기존에도 단위 테스트가 없는 클라이언트 컴포넌트라 기존 관례를 따른다. 대신 Step 4에서 개발 서버로 직접 확인한다.

- [ ] **Step 1: 게시 버튼 교체**

`web/src/app/admin/profiles/[id]/editor.tsx`의 415~428번째 줄(`{approved && ( <StampButton ... 게시됨으로 표시 ... )}`) 블록 전체를 교체:

```tsx
        {approved && (
          <StampButton
            tone="blue"
            disabled={!!busy}
            onClick={() => {
              if (!confirm('Threads에 바로 게시할까요? 게시 후에는 취소할 수 없습니다.')) {
                return;
              }
              return call(`/api/profiles/${profile.id}/publish`, { method: 'POST' }, 'publish');
            }}
          >
            {busy === 'publish' ? '게시 중…' : 'API로 게시'}
          </StampButton>
        )}
```

- [ ] **Step 2: Threads 연동 섹션 컴포넌트 작성**

Create `web/src/app/admin/settings/threads-settings.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { StampButton } from '@/components/admin-ui';

export type ThreadsStatus = {
  connected: boolean;
  username: string | null;
  tokenExpiresAt: string | null;
};

export function ThreadsSettings({
  initial,
  errorMessage,
}: {
  initial: ThreadsStatus;
  errorMessage: string | null;
}) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function disconnect() {
    if (!confirm('Threads 연결을 해제할까요?')) return;
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/admin/threads/disconnect', { method: 'POST' });
    setBusy(false);
    if (!response.ok) {
      setMessage('연결 해제에 실패했습니다.');
      return;
    }
    setStatus({ connected: false, username: null, tokenExpiresAt: null });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-extrabold text-on-card">Threads 연동</h2>
      {errorMessage ? (
        <p className="text-sm font-bold text-telop-red">연결 실패: {errorMessage}</p>
      ) : null}
      {status.connected ? (
        <p className="text-sm text-on-card">
          연결됨 — @{status.username ?? '알 수 없음'}
          {status.tokenExpiresAt
            ? ` · 만료: ${new Date(status.tokenExpiresAt).toLocaleDateString('ko-KR')}`
            : ''}
        </p>
      ) : (
        <p className="text-sm text-muted-on-card">연결되지 않았습니다.</p>
      )}
      <div className="flex gap-3">
        {!status.connected && (
          <StampButton
            tone="blue"
            onClick={() => {
              window.location.href = '/api/admin/threads/connect';
            }}
          >
            Threads 연결
          </StampButton>
        )}
        {status.connected && (
          <StampButton tone="ghost" disabled={busy} onClick={disconnect}>
            {busy ? '해제 중…' : '연결 해제'}
          </StampButton>
        )}
      </div>
      {message ? <p className="text-sm font-bold text-telop-red">{message}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: 설정 페이지에 연동**

`web/src/app/admin/settings/page.tsx` 전체를 교체:

```tsx
import { AdminTopBar, Panel } from '@/components/admin-ui';
import { getLlmConfig, toPublicLlmConfig } from '@/lib/llm/config';
import { getThreadsAccount } from '@/lib/threads/account';
import { LlmSettingsForm } from './settings-form';
import { ThreadsSettings } from './threads-settings';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ threadsError?: string }>;
}) {
  const config = await getLlmConfig();
  const threadsAccount = await getThreadsAccount();
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <AdminTopBar />
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-fog">설정</h1>
        <p className="mt-1 text-sm text-fog-muted">
          LLM provider, Threads 연결, 관리자용 API 키를 관리합니다.
        </p>
      </div>
      <Panel>
        <LlmSettingsForm initial={toPublicLlmConfig(config)} />
      </Panel>
      <div className="mt-6">
        <Panel>
          <ThreadsSettings
            initial={{
              connected: Boolean(threadsAccount),
              username: threadsAccount?.username ?? null,
              tokenExpiresAt: threadsAccount?.tokenExpiresAt.toISOString() ?? null,
            }}
            errorMessage={params.threadsError ?? null}
          />
        </Panel>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: 개발 서버로 직접 확인**

Run: `pnpm --dir web infra:up && pnpm --dir web db:migrate && pnpm --dir web dev`

브라우저로 `http://localhost:3000/admin/settings`에 접속해:
1. "Threads 연동" 섹션이 "연결되지 않았습니다."로 보이는지 확인.
2. `.env`에 `THREADS_APP_ID`/`THREADS_APP_SECRET`/`THREADS_REDIRECT_URI`를 아직 안 넣은 상태에서 "Threads 연결" 클릭 → 503 에러 JSON이 그대로 보이는 것을 확인(정상 — Meta 앱 등록 전 예상 동작).
3. APPROVED 상태 프로필 상세 화면에서 "API로 게시" 버튼이 (기존 "게시됨으로 표시" 대신) 보이는지 확인, 클릭 시 confirm 대화상자가 뜨고 취소하면 아무 요청도 안 가는지 확인.
4. 실제 Meta 앱 등록 후의 전체 연결→게시 흐름은 배포 환경에서 별도로 확인한다(§3 제약 — localhost redirect URI 불가).

서버를 멈춘다: `Ctrl+C`

- [ ] **Step 5: 문서 갱신**

`web/README.md`의 "6. **게시됨으로 표시**" 항목을:

```
6. **API로 게시** — 승인된 프로필을 Threads Publishing API로 실제 게시합니다. 앱에서 상태와 게시
   번호(seq), 게시물 id가 함께 남습니다. 최초 1회 `/admin/settings`에서 "Threads 연결"이 필요합니다.
```

로 바꾼다.

"## 알려진 한계"의 다음 줄을:

```
- **Threads Publishing API(서브시스템 3)는 아직 없습니다.** 게시는 손으로 하고, 승인된 프로필에서 「게시됨으로 표시」로 상태·게시 번호(`seq`)만 앱에 남깁니다.
```

에서 아래로 바꾼다:

```
- **사진은 아직 API로 게시할 수 없습니다.** 텍스트(`finalBody`)만 Threads Publishing API로 게시합니다.
- **Threads 연결(OAuth)은 로컬에서 실제로 테스트할 수 없습니다.** Meta가 `https` redirect URI를
  요구해 배포 환경(또는 터널)에서만 연결을 완료할 수 있습니다.
```

"## 사용법" 다음, "## 관심 문의 (인바운드 매칭)" 앞에 새 절을 추가:

```markdown
## Threads API 연동 (최초 1회)

1. [Meta for Developers](https://developers.facebook.com)에서 앱 생성 → "Threads API" 제품 추가.
2. 앱 설정에 redirect URI로 배포 도메인의 `/api/admin/threads/callback`을 등록
   (예: `https://<도메인>/api/admin/threads/callback`).
3. 발급된 App ID/App Secret을 `.env`의 `THREADS_APP_ID`/`THREADS_APP_SECRET`에, redirect URI를
   `THREADS_REDIRECT_URI`에 그대로 넣는다.
4. 관리자 로그인 후 `/admin/settings`의 "Threads 연동"에서 "Threads 연결"을 눌러 OAuth를 완료한다.
   이후 앱이 장기 토큰을 보관·자동 갱신한다.
```

- [ ] **Step 6: 전체 테스트·타입 확인**

Run: `pnpm --dir web test && pnpm --dir web typecheck`
Expected: 전부 PASS.

- [ ] **Step 7: 커밋**

```bash
git add web/src/app/admin web/README.md
git commit -m "feat: 게시 버튼을 Threads API 게시로 교체하고 연동 설정 화면 추가"
```

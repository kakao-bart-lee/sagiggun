# 매칭 플랫폼 수집·포맷팅 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자가 스레드 DM 원문과 사진을 붙여넣으면, LLM이 항목을 추출하고 게시용 문구 초안을 만들며, 운영자가 검수·승인한 문구가 나오는 관리자 웹앱을 만든다.

**Architecture:** Next.js(App Router) 단일 앱. 추출(텍스트→필드)과 작문(필드+사진→문구)을 별도 LLM 호출로 분리하고, 승인 없이는 게시할 수 없게 상태 기계로 강제한다. 사진은 파일시스템 볼륨에 저장하고 인증된 라우트로만 제공한다. 기존 크롬 확장은 `extension/` 하위로 옮겨 같은 저장소에 공존한다.

**Tech Stack:** Next.js 16(App Router) · React 19 · Prisma 7 + PostgreSQL 16 · Tailwind CSS 4 · zod 4 · Vitest · Anthropic TypeScript SDK · pnpm · docker-compose

## Global Constraints

- 패키지 매니저는 **pnpm**. `web/` 디렉터리 안에서만 실행한다.
- LLM 모델은 **`claude-opus-5`**. 다른 모델로 바꾸지 않는다.
- **`temperature`·`top_p`·`top_k`를 절대 보내지 않는다** — Opus 5에서 400을 반환한다.
- Opus 5는 **thinking이 기본 켜짐**이고 `max_tokens`가 thinking과 응답을 **함께** 제한한다. 모든 호출에 `max_tokens: 16000` 이상을 준다.
- thinking 깊이는 `output_config: { effort: ... }` 로만 조절한다. `budget_tokens`는 400이다.
- 구조화 출력은 `client.messages.parse()` + `output_config.format`(zod). 어시스턴트 프리필은 400이므로 쓰지 않는다.
- `partnerBirthYearMin`/`Max`는 **나이가 아니라 출생연도**로 저장한다.
- `draftBody`/`finalBody`에 게시 번호(`50.`)를 넣지 않는다. 본문은 `✨`로 시작한다.
- 프로필 삭제 시 DB 행과 **저장소의 사진 파일을 함께** 지운다.
- 모든 `/admin` 및 `/api` 경로는 세션 쿠키를 요구한다. 사진 제공 라우트도 예외가 아니다.
- 사진 업로드 제한: `image/jpeg`·`image/png`·`image/webp`만, 파일당 10MB, 프로필당 10장.
- 사용자 노출 문자열은 한국어.
- 크롬 확장(`extension/`)의 코드는 이 계획에서 **기능적으로 수정하지 않는다.** 경로 이동에 따른 설정 갱신만 한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `extension/**` | 기존 크롬 확장 (루트에서 이동) |
| `web/prisma/schema.prisma` | 데이터 모델 |
| `web/src/lib/env.ts` | 환경변수 로드·검증 |
| `web/src/lib/prisma.ts` | Prisma 클라이언트 싱글턴 |
| `web/src/lib/auth.ts` | 세션 토큰 서명·검증 (Web Crypto) |
| `web/src/lib/storage.ts` | 사진 파일 저장소 (put/get/remove) |
| `web/src/lib/llm/client.ts` | Anthropic 클라이언트 |
| `web/src/lib/llm/extract.ts` | 원문 → 구조화 필드 |
| `web/src/lib/llm/template.ts` | 게시 문구 형식 정의 |
| `web/src/lib/llm/compose.ts` | 필드 + 사진 → 게시 문구 초안 |
| `web/src/lib/profile/state.ts` | 상태 전이 규칙 (순수 함수) |
| `web/src/lib/profile/service.ts` | 프로필 CRUD, 중복 감지, 삭제 |
| `web/src/middleware.ts` | 인증 게이트 |
| `web/src/app/api/**` | REST 엔드포인트 |
| `web/src/app/admin/**` | 관리자 화면 |

---

### Task 1: 저장소 재구성 + 웹앱 스캐폴드

**Files:**
- Move: 루트의 `manifest.json`, `src/`, `tests/`, `package.json`, `package-lock.json`, `vitest.config.js` → `extension/`
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/vitest.config.ts`, `web/postcss.config.mjs`, `web/src/app/layout.tsx`, `web/src/app/globals.css`, `web/src/app/page.tsx`, `web/.env.example`, `web/docker-compose.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 없음
- Produces: `web/` 에서 `pnpm dev`, `pnpm test`, `pnpm typecheck` 가 동작하는 상태. `extension/` 에서 `npm test` 가 기존과 동일하게 동작.

> **주의:** 확장을 옮기면 이미 설치한 사용자는 `chrome://extensions`에서 기존 확장을 제거하고 `sagiggun/extension` 폴더로 다시 로드해야 한다. 저장된 문구는 브라우저 프로필에 있으므로 남는다.

- [ ] **Step 1: 확장 파일 이동**

```bash
mkdir -p extension
git mv manifest.json src tests package.json package-lock.json vitest.config.js extension/
```

- [ ] **Step 2: 확장 테스트가 새 위치에서 통과하는지 확인**

Run: `cd extension && npm test`
Expected: `Tests  104 passed (104)`

경로가 전부 상대경로라 수정 없이 통과해야 한다. 실패하면 어떤 경로가 깨졌는지 보고 고친다.

- [ ] **Step 3: manifest 파일 참조 검증**

Run:

```bash
cd extension && node -e "const m=require('./manifest.json'),f=require('fs');const miss=m.content_scripts[0].js.filter(p=>!f.existsSync(p));if(miss.length){console.error('없는 파일:',miss);process.exit(1)}console.log('OK:',m.content_scripts[0].js.length)"
```

Expected: `OK: 6`

- [ ] **Step 4: 확장 이동 커밋**

```bash
git add -A
git commit -m "refactor: 크롬 확장을 extension/ 하위로 이동"
```

- [ ] **Step 5: Next.js 앱 생성**

```bash
mkdir -p web && cd web
pnpm init
pnpm add next react react-dom @prisma/client @prisma/adapter-pg pg zod @anthropic-ai/sdk
pnpm add -D typescript @types/node @types/react @types/react-dom prisma vitest jsdom @vitejs/plugin-react tailwindcss @tailwindcss/postcss postcss
```

- [ ] **Step 6: 설정 파일 작성**

`web/package.json` 을 편집한다. **`dependencies`·`devDependencies` 는 Step 5에서 설치된 그대로 두고**, 아래 키만 추가하거나 교체한다.

```json
{
  "name": "matching-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "infra:up": "docker compose up -d postgres",
    "infra:down": "docker compose down"
  }
}
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@prisma/client'],
};

export default config;
```

`web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    unstubGlobals: true,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
```

`web/postcss.config.mjs`:

```js
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
```

- [ ] **Step 7: 앱 셸 작성**

`web/src/app/globals.css`:

```css
@import "tailwindcss";

:root { color-scheme: dark; }

body {
  background: #101010;
  color: #f5f5f5;
}
```

`web/src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '매칭 관리자',
  description: '자기소개 수집과 게시 문구 검수',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

`web/src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/admin');
}
```

- [ ] **Step 8: docker-compose 와 환경변수 예시 작성**

`web/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: matching_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: matching
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "${POSTGRES_PORT:-15433}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d matching"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres_data:
```

`web/.env.example`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:15433/matching
ADMIN_PASSWORD=change-me
SESSION_SECRET=change-me-to-a-long-random-string
ANTHROPIC_API_KEY=sk-ant-...
PHOTO_DIR=./.photos
```

- [ ] **Step 9: .gitignore 갱신**

루트 `.gitignore` 에 다음 줄을 추가한다(기존 내용은 지우지 않는다).

```
web/node_modules/
web/.next/
web/.photos/
web/.env
```

- [ ] **Step 10: 빌드와 테스트가 도는지 확인**

Run: `cd web && pnpm typecheck && pnpm test`
Expected: typecheck 통과. vitest 는 테스트 파일이 없어 `No test files found` 로 끝난다 — 정상이다.

- [ ] **Step 11: 커밋**

```bash
git add -A
git commit -m "feat: Next.js 웹앱 스캐폴드와 postgres compose 추가"
```

---

### Task 2: 데이터 모델과 Prisma 클라이언트

**Files:**
- Create: `web/prisma/schema.prisma`, `web/src/lib/env.ts`, `web/src/lib/prisma.ts`
- Test: `web/tests/env.test.ts`

**Interfaces:**
- Consumes: Task 1의 스캐폴드
- Produces:
  - `@/lib/env` → `getEnv(source?: Record<string, string | undefined>): Env`
    - `Env = { databaseUrl: string; adminPassword: string; sessionSecret: string; anthropicApiKey: string; photoDir: string }`
  - `@/lib/prisma` → `prisma: PrismaClient`
  - Prisma 모델 `Profile`, `Photo`, enum `Status`

- [ ] **Step 1: env 실패 테스트 작성**

`web/tests/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getEnv } from '@/lib/env';

const full = {
  DATABASE_URL: 'postgresql://localhost/x',
  ADMIN_PASSWORD: 'pw',
  SESSION_SECRET: 'a'.repeat(32),
  ANTHROPIC_API_KEY: 'sk-ant-x',
  PHOTO_DIR: './.photos',
};

describe('getEnv', () => {
  it('필요한 값을 모두 읽는다', () => {
    const env = getEnv(full);
    expect(env.databaseUrl).toBe('postgresql://localhost/x');
    expect(env.adminPassword).toBe('pw');
    expect(env.photoDir).toBe('./.photos');
  });

  it('PHOTO_DIR이 없으면 기본값을 쓴다', () => {
    const { PHOTO_DIR, ...rest } = full;
    expect(getEnv(rest).photoDir).toBe('./.photos');
  });

  it('필수 값이 비면 무엇이 빠졌는지 알려주며 실패한다', () => {
    const { ADMIN_PASSWORD, ...rest } = full;
    expect(() => getEnv(rest)).toThrow(/ADMIN_PASSWORD/);
  });

  it('SESSION_SECRET이 너무 짧으면 실패한다', () => {
    expect(() => getEnv({ ...full, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd web && pnpm test`
Expected: FAIL — `Failed to resolve import "@/lib/env"`

- [ ] **Step 3: env 모듈 구현**

`web/src/lib/env.ts`:

```ts
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),
  // 서명 키가 짧으면 세션 위조가 쉬워진다. 32자 이상을 강제한다.
  SESSION_SECRET: z.string().min(32),
  ANTHROPIC_API_KEY: z.string().min(1),
  PHOTO_DIR: z.string().min(1).default('./.photos'),
});

export type Env = {
  databaseUrl: string;
  adminPassword: string;
  sessionSecret: string;
  anthropicApiKey: string;
  photoDir: string;
};

export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`환경변수가 올바르지 않습니다: ${fields}`);
  }
  const v = parsed.data;
  return {
    databaseUrl: v.DATABASE_URL,
    adminPassword: v.ADMIN_PASSWORD,
    sessionSecret: v.SESSION_SECRET,
    anthropicApiKey: v.ANTHROPIC_API_KEY,
    photoDir: v.PHOTO_DIR,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && pnpm test`
Expected: PASS — 4개 통과

- [ ] **Step 5: Prisma 스키마 작성**

`web/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Status {
  COLLECTED
  DRAFTED
  APPROVED
  PUBLISHED
  ARCHIVED
}

model Profile {
  id     String @id @default(cuid())
  seq    Int?   @unique
  status Status @default(COLLECTED)

  // 원본 — 언제든 다시 처리할 수 있어야 한다
  sourceHandle String
  rawText      String @db.Text

  // 추출 결과
  gender              String?
  birthYear           Int?
  region              String?
  heightCm            Int?
  job                 String?
  hobbies             String[]
  appealPoints        String[]
  idealType           String[]
  partnerBirthYearMin Int?
  partnerBirthYearMax Int?
  partnerRegions      String[]
  dealBreakers        String[]

  // 작문 결과 — 게시 번호는 포함하지 않는다
  draftBody String? @db.Text
  finalBody String? @db.Text

  // 게시 (서브시스템 3)
  publishedPostId String?
  publishedAt     DateTime?

  photos    Photo[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([sourceHandle])
  @@index([status])
}

model Photo {
  id          String  @id @default(cuid())
  profileId   String
  profile     Profile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  storageKey  String
  contentType String
  bytes       Int
  order       Int     @default(0)

  createdAt DateTime @default(now())

  @@index([profileId])
}
```

- [ ] **Step 6: Prisma 클라이언트 싱글턴 작성**

개발 중 핫 리로드가 연결을 계속 새로 만들지 않도록 전역에 캐시한다.

`web/src/lib/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 7: DB 기동과 마이그레이션**

```bash
cd web
cp .env.example .env
pnpm infra:up
pnpm db:migrate --name init
```

Expected: `matching_postgres` 컨테이너가 뜨고 마이그레이션이 적용된다. `prisma generate` 도 함께 돈다.

`.env`의 `SESSION_SECRET`을 실제 랜덤 값으로 바꾼다:

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Step 8: 커밋**

```bash
git add web/prisma web/src/lib/env.ts web/src/lib/prisma.ts web/tests/env.test.ts web/.env.example
git commit -m "feat: 프로필·사진 데이터 모델과 환경변수 검증"
```

---

### Task 3: 관리자 인증

**Files:**
- Create: `web/src/lib/auth.ts`, `web/src/middleware.ts`, `web/src/app/api/auth/login/route.ts`, `web/src/app/api/auth/logout/route.ts`
- Test: `web/tests/auth.test.ts`

**Interfaces:**
- Consumes: `@/lib/env` (Task 2)
- Produces: `@/lib/auth` —
  - `SESSION_COOKIE = 'matching_session'`
  - `createSessionToken(secret: string, expiresAt: number): Promise<string>`
  - `verifySessionToken(secret: string, token: string, now: number): Promise<boolean>`

**토큰 형식:** `<만료시각(ms)>.<base64url(HMAC-SHA256)>`. `crypto.subtle`로 서명하므로 Node 런타임과 미들웨어의 Edge 런타임 양쪽에서 동작한다. Node의 `node:crypto`를 쓰면 미들웨어에서 깨진다.

- [ ] **Step 1: 실패 테스트 작성**

`web/tests/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/auth';

const SECRET = 'a'.repeat(32);
const NOW = 1_700_000_000_000;

describe('세션 토큰', () => {
  it('만들고 검증하면 통과한다', async () => {
    const token = await createSessionToken(SECRET, NOW + 60_000);
    expect(await verifySessionToken(SECRET, token, NOW)).toBe(true);
  });

  it('만료되면 거부한다', async () => {
    const token = await createSessionToken(SECRET, NOW - 1);
    expect(await verifySessionToken(SECRET, token, NOW)).toBe(false);
  });

  it('다른 비밀키로는 검증되지 않는다', async () => {
    const token = await createSessionToken(SECRET, NOW + 60_000);
    expect(await verifySessionToken('b'.repeat(32), token, NOW)).toBe(false);
  });

  it('만료시각을 늘려 위조하면 거부한다', async () => {
    const token = await createSessionToken(SECRET, NOW + 1000);
    const [, sig] = token.split('.');
    const forged = `${NOW + 999_999}.${sig}`;
    expect(await verifySessionToken(SECRET, forged, NOW)).toBe(false);
  });

  it('형식이 깨진 토큰을 거부한다', async () => {
    for (const bad of ['', '.', 'abc', 'abc.def', '123', `${NOW + 1000}.`]) {
      expect(await verifySessionToken(SECRET, bad, NOW)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd web && pnpm test tests/auth.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/auth"`

- [ ] **Step 3: auth 모듈 구현**

`web/src/lib/auth.ts`:

```ts
export const SESSION_COOKIE = 'matching_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret);
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

export async function createSessionToken(secret: string, expiresAt: number): Promise<string> {
  const payload = String(expiresAt);
  return `${payload}.${await sign(secret, payload)}`;
}

export async function verifySessionToken(
  secret: string,
  token: string,
  now: number
): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !signature) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt)) return false;

  // 서명을 먼저 확인한다. 만료시각은 서명에 포함되어 있으므로 위조할 수 없다.
  const expected = await sign(secret, payload);
  if (!timingSafeEqual(expected, signature)) return false;

  return expiresAt > now;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && pnpm test`
Expected: PASS — env 4개 + auth 5개

- [ ] **Step 5: 미들웨어 작성**

`web/src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

const PUBLIC_PATHS = ['/admin/login', '/api/auth/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? '';
  const ok = !!secret && (await verifySessionToken(secret, token, Date.now()));
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
```

- [ ] **Step 6: 로그인·로그아웃 라우트 작성**

`web/src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { SESSION_COOKIE, SESSION_TTL_MS, createSessionToken } from '@/lib/auth';

const body = z.object({ password: z.string() });

export async function POST(request: Request) {
  const env = getEnv();
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  if (parsed.data.password !== env.adminPassword) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const token = await createSessionToken(env.sessionSecret, Date.now() + SESSION_TTL_MS);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
```

`web/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
```

- [ ] **Step 7: 커밋**

```bash
git add web/src/lib/auth.ts web/src/middleware.ts web/src/app/api/auth web/tests/auth.test.ts
git commit -m "feat: 서명 쿠키 기반 관리자 인증"
```

---

### Task 4: 사진 저장소

**Files:**
- Create: `web/src/lib/storage.ts`
- Test: `web/tests/storage.test.ts`

**Interfaces:**
- Consumes: `@/lib/env` (Task 2)
- Produces: `@/lib/storage` —
  - `ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']`
  - `MAX_BYTES = 10 * 1024 * 1024`
  - `MAX_PHOTOS_PER_PROFILE = 10`
  - `putPhoto(profileId: string, data: Uint8Array, contentType: string, baseDir?: string): Promise<string>` — 저장 키를 돌려준다
  - `readPhoto(storageKey: string, baseDir?: string): Promise<Uint8Array>`
  - `removePhoto(storageKey: string, baseDir?: string): Promise<void>` — 없는 파일이어도 던지지 않는다
  - `assertUploadable(contentType: string, bytes: number, existingCount: number): void` — 어기면 한국어 메시지로 던진다

**경로 안전:** `storageKey`는 `<profileId>/<랜덤>.<확장자>` 형태로 **우리가 만든다.** 외부 입력을 경로로 쓰지 않는다. 읽기·삭제 시에도 해석된 절대경로가 기준 디렉터리 안에 있는지 확인한다 — 키가 DB에서 오더라도 검증한다.

- [ ] **Step 1: 실패 테스트 작성**

`web/tests/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  putPhoto,
  readPhoto,
  removePhoto,
  assertUploadable,
  MAX_BYTES,
  MAX_PHOTOS_PER_PROFILE,
} from '@/lib/storage';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'photos-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const bytes = new Uint8Array([1, 2, 3, 4]);

describe('putPhoto / readPhoto', () => {
  it('저장한 내용을 그대로 읽는다', async () => {
    const key = await putPhoto('prof1', bytes, 'image/png', dir);
    expect(await readPhoto(key, dir)).toEqual(bytes);
  });

  it('저장 키는 프로필 id로 시작하고 확장자가 붙는다', async () => {
    const key = await putPhoto('prof1', bytes, 'image/webp', dir);
    expect(key.startsWith('prof1/')).toBe(true);
    expect(key.endsWith('.webp')).toBe(true);
  });

  it('같은 프로필에 두 번 저장해도 키가 겹치지 않는다', async () => {
    const a = await putPhoto('prof1', bytes, 'image/png', dir);
    const b = await putPhoto('prof1', bytes, 'image/png', dir);
    expect(a).not.toBe(b);
  });
});

describe('removePhoto', () => {
  it('파일을 지운다', async () => {
    const key = await putPhoto('prof1', bytes, 'image/png', dir);
    await removePhoto(key, dir);
    await expect(readPhoto(key, dir)).rejects.toThrow();
  });

  it('없는 파일을 지워도 던지지 않는다', async () => {
    await expect(removePhoto('prof1/nope.png', dir)).resolves.toBeUndefined();
  });
});

describe('경로 탈출 차단', () => {
  it('상위 디렉터리로 나가는 키를 거부한다', async () => {
    await expect(readPhoto('../secret.txt', dir)).rejects.toThrow(/경로/);
    await expect(removePhoto('../secret.txt', dir)).rejects.toThrow(/경로/);
  });

  it('절대경로 키를 거부한다', async () => {
    await expect(readPhoto('/etc/passwd', dir)).rejects.toThrow(/경로/);
  });
});

describe('assertUploadable', () => {
  it('허용된 형식은 통과한다', () => {
    expect(() => assertUploadable('image/jpeg', 1000, 0)).not.toThrow();
  });

  it('허용되지 않은 형식을 거부한다', () => {
    expect(() => assertUploadable('application/pdf', 1000, 0)).toThrow(/형식/);
    expect(() => assertUploadable('image/gif', 1000, 0)).toThrow(/형식/);
  });

  it('크기 제한을 넘으면 거부한다', () => {
    expect(() => assertUploadable('image/png', MAX_BYTES + 1, 0)).toThrow(/크기/);
  });

  it('장수 제한에 도달하면 거부한다', () => {
    expect(() => assertUploadable('image/png', 1000, MAX_PHOTOS_PER_PROFILE)).toThrow(/장/);
    expect(() => assertUploadable('image/png', 1000, MAX_PHOTOS_PER_PROFILE - 1)).not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd web && pnpm test tests/storage.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/storage"`

- [ ] **Step 3: storage 모듈 구현**

`web/src/lib/storage.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '@/lib/env';

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_PROFILE = 10;

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function baseDirOf(override?: string): string {
  return path.resolve(override ?? getEnv().photoDir);
}

// storageKey는 우리가 만들지만, DB를 거쳐 돌아온 값도 검증한다.
// 해석된 경로가 기준 디렉터리 밖이면 거부한다.
function resolveKey(storageKey: string, baseDir: string): string {
  const full = path.resolve(baseDir, storageKey);
  const prefix = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (full !== baseDir && !full.startsWith(prefix)) {
    throw new Error(`저장 경로가 허용 범위를 벗어났습니다: ${storageKey}`);
  }
  return full;
}

export function assertUploadable(
  contentType: string,
  bytes: number,
  existingCount: number
): void {
  if (!(ALLOWED_TYPES as readonly string[]).includes(contentType)) {
    throw new Error(`지원하지 않는 이미지 형식입니다: ${contentType}`);
  }
  if (bytes > MAX_BYTES) {
    throw new Error(`사진 크기가 제한(10MB)을 넘습니다.`);
  }
  if (existingCount >= MAX_PHOTOS_PER_PROFILE) {
    throw new Error(`사진은 프로필당 최대 ${MAX_PHOTOS_PER_PROFILE}장까지 올릴 수 있습니다.`);
  }
}

export async function putPhoto(
  profileId: string,
  data: Uint8Array,
  contentType: string,
  baseDir?: string
): Promise<string> {
  const ext = EXTENSION[contentType];
  if (!ext) throw new Error(`지원하지 않는 이미지 형식입니다: ${contentType}`);

  const key = `${profileId}/${crypto.randomUUID()}.${ext}`;
  const root = baseDirOf(baseDir);
  const full = resolveKey(key, root);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return key;
}

export async function readPhoto(storageKey: string, baseDir?: string): Promise<Uint8Array> {
  const full = resolveKey(storageKey, baseDirOf(baseDir));
  return new Uint8Array(await fs.readFile(full));
}

export async function removePhoto(storageKey: string, baseDir?: string): Promise<void> {
  const full = resolveKey(storageKey, baseDirOf(baseDir));
  await fs.rm(full, { force: true });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd web && pnpm test`
Expected: PASS — env 4 + auth 5 + storage 11

- [ ] **Step 5: 커밋**

```bash
git add web/src/lib/storage.ts web/tests/storage.test.ts
git commit -m "feat: 경로 탈출을 막는 사진 저장소 계층"
```

---

### Task 5: LLM 추출

**Files:**
- Create: `web/src/lib/llm/client.ts`, `web/src/lib/llm/extract.ts`
- Test: `web/tests/extract.test.ts`

**Interfaces:**
- Consumes: `@/lib/env` (Task 2)
- Produces:
  - `@/lib/llm/client` → `getAnthropic(): Anthropic`, `MODEL = 'claude-opus-5'`
  - `@/lib/llm/extract` →
    - `ExtractedSchema` (zod 스키마)
    - `Extracted` (타입)
    - `EXTRACT_SYSTEM: string`
    - `extractFields(rawText: string, deps?: { parse?: ParseFn }): Promise<Extracted>`
    - `ParseFn = (args: unknown) => Promise<{ parsed_output: unknown }>`

`deps.parse` 주입 지점이 있어야 테스트가 LLM 없이 판정 로직을 검증할 수 있다.

- [ ] **Step 1: 실패 테스트 작성**

`web/tests/extract.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ExtractedSchema, extractFields, EXTRACT_SYSTEM } from '@/lib/llm/extract';

const valid = {
  gender: 'F',
  birthYear: 2002,
  region: '서울',
  heightCm: 163,
  job: '금융권',
  hobbies: ['워터파크', '스노보드'],
  appealPoints: ['무던하다', '인간관계가 깔끔하다'],
  idealType: ['175cm 이상', '담백한 분'],
  partnerBirthYearMin: 1997,
  partnerBirthYearMax: 2004,
  partnerRegions: ['서울', '경기', '인천'],
  dealBreakers: ['이성문제', '술 영업'],
};

describe('ExtractedSchema', () => {
  it('정상 형태를 통과시킨다', () => {
    expect(ExtractedSchema.parse(valid)).toEqual(valid);
  });

  it('모르는 항목은 null을 허용한다', () => {
    const parsed = ExtractedSchema.parse({ ...valid, heightCm: null, job: null });
    expect(parsed.heightCm).toBeNull();
    expect(parsed.job).toBeNull();
  });

  it('배열 항목이 빠지면 실패한다', () => {
    const { hobbies, ...rest } = valid;
    expect(() => ExtractedSchema.parse(rest)).toThrow();
  });

  it('gender는 F/M/null만 허용한다', () => {
    expect(() => ExtractedSchema.parse({ ...valid, gender: '여성' })).toThrow();
    expect(ExtractedSchema.parse({ ...valid, gender: null }).gender).toBeNull();
  });
});

describe('extractFields', () => {
  it('parse 결과를 스키마로 검증해 돌려준다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: valid }));
    const result = await extractFields('원문', { parse });
    expect(result).toEqual(valid);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('원문을 사용자 메시지로 보낸다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: valid }));
    await extractFields('나는 02년생입니다', { parse });
    const args = parse.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(args.messages)).toContain('나는 02년생입니다');
  });

  it('금지된 샘플링 파라미터를 보내지 않는다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: valid }));
    await extractFields('원문', { parse });
    const args = parse.mock.calls[0][0] as Record<string, unknown>;
    expect(args.temperature).toBeUndefined();
    expect(args.top_p).toBeUndefined();
    expect(args.top_k).toBeUndefined();
  });

  it('thinking 여유를 두고 max_tokens를 넉넉히 잡는다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: valid }));
    await extractFields('원문', { parse });
    const args = parse.mock.calls[0][0] as { max_tokens: number };
    expect(args.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it('parsed_output이 스키마에 맞지 않으면 무엇이 틀렸는지 알려주며 던진다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: { gender: '여성' } }));
    await expect(extractFields('원문', { parse })).rejects.toThrow(/추출/);
  });

  it('parsed_output이 null이면 던진다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: null }));
    await expect(extractFields('원문', { parse })).rejects.toThrow(/추출/);
  });
});

describe('EXTRACT_SYSTEM', () => {
  it('추측을 금지한다고 명시한다', () => {
    expect(EXTRACT_SYSTEM).toMatch(/추측/);
  });

  it('출생연도로 저장하라고 지시한다', () => {
    expect(EXTRACT_SYSTEM).toMatch(/출생연도/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd web && pnpm test tests/extract.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/llm/extract"`

- [ ] **Step 3: Anthropic 클라이언트 작성**

`web/src/lib/llm/client.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '@/lib/env';

export const MODEL = 'claude-opus-5';

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: getEnv().anthropicApiKey });
  return client;
}
```

- [ ] **Step 4: 추출 모듈 구현**

`web/src/lib/llm/extract.ts`:

```ts
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropic, MODEL } from './client';

export const ExtractedSchema = z.object({
  gender: z.enum(['F', 'M']).nullable(),
  birthYear: z.number().int().nullable(),
  region: z.string().nullable(),
  heightCm: z.number().int().nullable(),
  job: z.string().nullable(),
  hobbies: z.array(z.string()),
  appealPoints: z.array(z.string()),
  idealType: z.array(z.string()),
  partnerBirthYearMin: z.number().int().nullable(),
  partnerBirthYearMax: z.number().int().nullable(),
  partnerRegions: z.array(z.string()),
  dealBreakers: z.array(z.string()),
});

export type Extracted = z.infer<typeof ExtractedSchema>;

export type ParseFn = (args: unknown) => Promise<{ parsed_output: unknown }>;

export const EXTRACT_SYSTEM = `당신은 소개팅 신청서를 정리하는 도우미입니다.
사용자가 보낸 자기소개 원문에서 정해진 항목을 뽑아냅니다.

규칙:
- 원문에 없는 항목은 null 또는 빈 배열로 둡니다. 절대 추측하지 마세요.
- 나이는 출생연도로 환산합니다. "02년생"은 2002입니다.
- 이상형의 나이 조건도 출생연도로 환산합니다. "97년생~04년생"이면 min=1997, max=2004입니다.
  "20대 후반"처럼 출생연도를 특정할 수 없는 표현은 null로 둡니다.
- 키는 센티미터 정수로 씁니다.
- 직업은 원문에 적힌 수준으로만 씁니다. "금융권"을 "은행원"으로 바꾸지 마세요.
- 배열 항목은 원문의 표현을 최대한 살려 짧은 구로 나눕니다.`;

const MAX_TOKENS = 16000;

export async function extractFields(
  rawText: string,
  deps: { parse?: ParseFn } = {}
): Promise<Extracted> {
  const parse: ParseFn =
    deps.parse ??
    ((args) =>
      getAnthropic().messages.parse(args as never) as Promise<{ parsed_output: unknown }>);

  const response = await parse({
    model: MODEL,
    // Opus 5는 thinking이 기본으로 켜지고 max_tokens가 thinking과 응답을
    // 함께 제한한다. 넉넉히 주지 않으면 응답이 잘린다.
    max_tokens: MAX_TOKENS,
    output_config: {
      effort: 'medium',
      format: zodOutputFormat(ExtractedSchema),
    },
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: rawText }],
  });

  const parsed = ExtractedSchema.safeParse(response.parsed_output);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`추출 결과가 형식에 맞지 않습니다: ${fields || '빈 응답'}`);
  }
  return parsed.data;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd web && pnpm test`
Expected: PASS — 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/llm web/tests/extract.test.ts
git commit -m "feat: 원문에서 프로필 항목을 뽑는 LLM 추출"
```

---

### Task 6: 게시 문구 작문

**Files:**
- Create: `web/src/lib/llm/template.ts`, `web/src/lib/llm/compose.ts`
- Test: `web/tests/compose.test.ts`

**Interfaces:**
- Consumes: `@/lib/llm/client` (Task 5), `Extracted` (Task 5)
- Produces:
  - `@/lib/llm/template` → `TEMPLATE: string`, `REQUIRED_MARKERS: string[]`, `hasTemplateShape(body: string): boolean`
  - `@/lib/llm/compose` →
    - `PhotoInput = { contentType: string; base64: string }`
    - `composeBody(fields: Extracted, photos: PhotoInput[], deps?: { create?: CreateFn }): Promise<string>`
    - `CreateFn = (args: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }>`

- [ ] **Step 1: 실패 테스트 작성**

`web/tests/compose.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { TEMPLATE, REQUIRED_MARKERS, hasTemplateShape } from '@/lib/llm/template';
import { composeBody } from '@/lib/llm/compose';
import type { Extracted } from '@/lib/llm/extract';

const fields: Extracted = {
  gender: 'F',
  birthYear: 2002,
  region: '서울',
  heightCm: 163,
  job: '금융권',
  hobbies: ['워터파크'],
  appealPoints: ['무던하다'],
  idealType: ['175cm 이상'],
  partnerBirthYearMin: 1997,
  partnerBirthYearMax: 2004,
  partnerRegions: ['서울'],
  dealBreakers: ['이성문제'],
};

const goodBody = [
  '✨ 서울에 거주중인 2002년생 여성분 입니다.',
  '금융권에서 근무중이신 163cm 강아지상 🐾',
  '취미: 워터파크',
  '사진에서도 발랄함이 느껴지는 분이에요',
  '비율도 좋고 귀여운 인상이에요',
  '본인의 장점은 💖',
  '1. 무던하다',
  '이상형은 📌',
  '1. 175cm 이상',
  '✔️ 97년생~04년생 가능해요!',
  '✔️ 서울 가능해요!',
  '❌이건 절대 안 돼요.',
  '이성문제',
  '📨 관심 있으신 분은 메세지 주세요!',
].join('\n');

describe('TEMPLATE', () => {
  it('게시 번호를 포함하지 않는다', () => {
    expect(TEMPLATE).not.toMatch(/\{seq\}/);
    expect(TEMPLATE.trimStart().startsWith('✨')).toBe(true);
  });
});

describe('hasTemplateShape', () => {
  it('필수 표지가 모두 있으면 통과한다', () => {
    expect(hasTemplateShape(goodBody)).toBe(true);
  });

  it('표지가 하나라도 빠지면 실패한다', () => {
    for (const marker of REQUIRED_MARKERS) {
      expect(hasTemplateShape(goodBody.replace(marker, ''))).toBe(false);
    }
  });

  it('번호가 앞에 붙으면 실패한다', () => {
    expect(hasTemplateShape(`50.\n${goodBody}`)).toBe(false);
  });
});

describe('composeBody', () => {
  const ok = () => ({ content: [{ type: 'text', text: goodBody }] });

  it('본문 텍스트를 돌려준다', async () => {
    const create = vi.fn(async () => ok());
    expect(await composeBody(fields, [], { create })).toBe(goodBody);
  });

  it('사진을 이미지 블록으로 함께 보낸다', async () => {
    const create = vi.fn(async () => ok());
    await composeBody(fields, [{ contentType: 'image/png', base64: 'AAAA' }], { create });
    const args = create.mock.calls[0][0] as { messages: Array<{ content: unknown[] }> };
    const blocks = args.messages[0].content as Array<{ type: string }>;
    expect(blocks.some((b) => b.type === 'image')).toBe(true);
  });

  it('사진이 없어도 동작한다', async () => {
    const create = vi.fn(async () => ok());
    await expect(composeBody(fields, [], { create })).resolves.toBe(goodBody);
  });

  it('금지된 샘플링 파라미터를 보내지 않는다', async () => {
    const create = vi.fn(async () => ok());
    await composeBody(fields, [], { create });
    const args = create.mock.calls[0][0] as Record<string, unknown>;
    expect(args.temperature).toBeUndefined();
    expect(args.top_p).toBeUndefined();
    expect(args.top_k).toBeUndefined();
  });

  it('max_tokens를 넉넉히 잡는다', async () => {
    const create = vi.fn(async () => ok());
    await composeBody(fields, [], { create });
    const args = create.mock.calls[0][0] as { max_tokens: number };
    expect(args.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it('형식이 어긋난 응답은 거부한다', async () => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: '아무 말' }] }));
    await expect(composeBody(fields, [], { create })).rejects.toThrow(/형식/);
  });

  it('텍스트 블록이 없으면 거부한다', async () => {
    const create = vi.fn(async () => ({ content: [] }));
    await expect(composeBody(fields, [], { create })).rejects.toThrow(/형식|비어/);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd web && pnpm test tests/compose.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/llm/template"`

- [ ] **Step 3: 템플릿 모듈 구현**

`web/src/lib/llm/template.ts`:

```ts
// 게시 번호(`50.`)는 본문에 넣지 않는다. 게시 시점에 앞에 붙인다.
export const TEMPLATE = `✨ {거주지}에 거주중인 {출생연도}년생 {성별}분 입니다.
{직업}에서 근무중이신 {키}cm {인상} {이모지}
취미: {취미}
{사진 인상 한 문장}
{외모 묘사 + 연예인 비유}
본인의 장점은 💖
1. {장점}
2. {장점}
3. {장점}
이상형은 📌
1. {이상형}
2. {이상형}
3. {이상형}
✔️ {출생연도 범위} 가능해요!
✔️ {가능 지역} 가능해요!
❌이건 절대 안 돼요.
{데알브레이커}
📨 관심 있으신 분은 메세지 주세요!`;

export const REQUIRED_MARKERS = [
  '✨',
  '취미:',
  '본인의 장점은 💖',
  '이상형은 📌',
  '✔️',
  '❌이건 절대 안 돼요.',
  '📨 관심 있으신 분은 메세지 주세요!',
];

export function hasTemplateShape(body: string): boolean {
  if (!body.trimStart().startsWith('✨')) return false;
  return REQUIRED_MARKERS.every((marker) => body.includes(marker));
}
```

- [ ] **Step 4: 작문 모듈 구현**

`web/src/lib/llm/compose.ts`:

```ts
import { getAnthropic, MODEL } from './client';
import { TEMPLATE, hasTemplateShape } from './template';
import type { Extracted } from './extract';

export type PhotoInput = { contentType: string; base64: string };

export type CreateFn = (
  args: unknown
) => Promise<{ content: Array<{ type: string; text?: string }> }>;

const MAX_TOKENS = 16000;

const SYSTEM = `당신은 소개팅 게시물 문구를 쓰는 편집자입니다.
주어진 항목과 사진을 보고 정해진 형식에 맞춰 소개 문구를 씁니다.

형식(이 골격을 그대로 따릅니다. 중괄호 자리를 실제 내용으로 채웁니다):
${TEMPLATE}

규칙:
- 주어진 항목에 없는 사실을 지어내지 마세요.
- 사진을 보고 쓰는 부분은 두 줄뿐입니다: 인상 한 문장과 외모 묘사입니다.
  나머지는 항목에서 결정됩니다.
- 외모 묘사는 호의적이고 담백하게 씁니다. 신체를 평가하거나 등급을 매기는 표현,
  외모를 조건으로 다는 표현은 쓰지 마세요.
- 이 문구는 사람이 검수한 뒤 공개 게시됩니다. 실존 인물에 대한 글임을 유념하세요.
- 맨 앞에 번호를 붙이지 마세요. 반드시 ✨ 로 시작합니다.
- 설명이나 머리말 없이 본문만 출력합니다.`;

function summarize(fields: Extracted): string {
  const yearRange =
    fields.partnerBirthYearMin && fields.partnerBirthYearMax
      ? `${String(fields.partnerBirthYearMin).slice(2)}년생~${String(fields.partnerBirthYearMax).slice(2)}년생`
      : '제한 없음';

  return [
    `거주지: ${fields.region ?? '미상'}`,
    `출생연도: ${fields.birthYear ?? '미상'}`,
    `성별: ${fields.gender === 'F' ? '여성' : fields.gender === 'M' ? '남성' : '미상'}`,
    `키: ${fields.heightCm ? `${fields.heightCm}cm` : '미상'}`,
    `직업: ${fields.job ?? '미상'}`,
    `취미: ${fields.hobbies.join(', ') || '미상'}`,
    `본인의 장점: ${fields.appealPoints.join(' / ') || '미상'}`,
    `이상형: ${fields.idealType.join(' / ') || '미상'}`,
    `가능한 나이대: ${yearRange}`,
    `가능한 지역: ${fields.partnerRegions.join(', ') || '제한 없음'}`,
    `절대 안 되는 것: ${fields.dealBreakers.join(', ') || '없음'}`,
  ].join('\n');
}

export async function composeBody(
  fields: Extracted,
  photos: PhotoInput[],
  deps: { create?: CreateFn } = {}
): Promise<string> {
  const create: CreateFn =
    deps.create ??
    ((args) =>
      getAnthropic().messages.create(args as never) as Promise<{
        content: Array<{ type: string; text?: string }>;
      }>);

  const imageBlocks = photos.map((photo) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: photo.contentType,
      data: photo.base64,
    },
  }));

  const response = await create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: 'high' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: [...imageBlocks, { type: 'text', text: summarize(fields) }],
      },
    ],
  });

  const text = response.content.find((block) => block.type === 'text')?.text?.trim();
  if (!text) throw new Error('작문 응답이 비어 있습니다.');
  if (!hasTemplateShape(text)) {
    throw new Error('작문 결과가 형식에 맞지 않습니다. 다시 시도해 주세요.');
  }
  return text;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd web && pnpm test`
Expected: PASS — 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/llm/template.ts web/src/lib/llm/compose.ts web/tests/compose.test.ts
git commit -m "feat: 사진을 함께 넣어 게시 문구 초안을 쓰는 작문 모듈"
```

---

### Task 7: 상태 기계와 프로필 서비스

**Files:**
- Create: `web/src/lib/profile/state.ts`, `web/src/lib/profile/service.ts`
- Test: `web/tests/state.test.ts`

**Interfaces:**
- Consumes: `@/lib/prisma` (Task 2), `@/lib/storage` (Task 4)
- Produces:
  - `@/lib/profile/state` —
    - `canApprove(p: { finalBody: string | null; status: Status }): { ok: true } | { ok: false; reason: string }`
    - `canPublish(p: { status: Status; finalBody: string | null }): { ok: true } | { ok: false; reason: string }`
    - `statusAfterEdit(current: Status): Status`
    - `statusAfterUnarchive(p: { draftBody: string | null }): Status`
  - `@/lib/profile/service` —
    - `findDuplicates(sourceHandle: string): Promise<Array<{ id: string; status: Status; createdAt: Date }>>`
    - `deleteProfile(id: string, deps?: DeleteDeps): Promise<void>` — 사진 파일까지 지운다
    - `DeleteDeps = { listKeys?: (id: string) => Promise<string[]>; removeFile?: (key: string) => Promise<void>; deleteRow?: (id: string) => Promise<void> }`

`deleteProfile` 의 주입 지점이 있어야 DB 없이 "행과 파일이 함께 지워지는가"를 테스트할 수 있다.

- [ ] **Step 1: 실패 테스트 작성**

`web/tests/state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  canApprove,
  canPublish,
  statusAfterEdit,
  statusAfterUnarchive,
} from '@/lib/profile/state';

describe('canApprove', () => {
  it('최종 문구가 있으면 승인할 수 있다', () => {
    expect(canApprove({ finalBody: '✨ 본문', status: 'DRAFTED' })).toEqual({ ok: true });
  });

  it('최종 문구가 없으면 거부하고 이유를 준다', () => {
    const result = canApprove({ finalBody: null, status: 'DRAFTED' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/문구/);
  });

  it('공백뿐인 문구는 없는 것으로 본다', () => {
    expect(canApprove({ finalBody: '   \n ', status: 'DRAFTED' }).ok).toBe(false);
  });

  it('보관된 프로필은 승인할 수 없다', () => {
    const result = canApprove({ finalBody: '✨ 본문', status: 'ARCHIVED' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/보관/);
  });
});

describe('canPublish', () => {
  it('APPROVED에서만 게시할 수 있다', () => {
    expect(canPublish({ status: 'APPROVED', finalBody: '✨ 본문' })).toEqual({ ok: true });
  });

  it('승인 전에는 게시할 수 없다', () => {
    for (const status of ['COLLECTED', 'DRAFTED', 'ARCHIVED'] as const) {
      const result = canPublish({ status, finalBody: '✨ 본문' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/승인/);
    }
  });

  it('이미 게시된 프로필은 다시 게시하지 않는다', () => {
    const result = canPublish({ status: 'PUBLISHED', finalBody: '✨ 본문' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/이미/);
  });
});

describe('statusAfterEdit', () => {
  it('승인 후 편집하면 초안으로 내려간다', () => {
    expect(statusAfterEdit('APPROVED')).toBe('DRAFTED');
  });

  it('초안 상태는 그대로 유지된다', () => {
    expect(statusAfterEdit('DRAFTED')).toBe('DRAFTED');
  });

  it('수집 상태는 그대로 유지된다', () => {
    expect(statusAfterEdit('COLLECTED')).toBe('COLLECTED');
  });

  it('게시된 프로필의 상태는 바꾸지 않는다', () => {
    expect(statusAfterEdit('PUBLISHED')).toBe('PUBLISHED');
  });
});

describe('statusAfterUnarchive', () => {
  it('초안이 있으면 DRAFTED로 돌아간다', () => {
    expect(statusAfterUnarchive({ draftBody: '✨ 본문' })).toBe('DRAFTED');
  });

  it('초안이 없으면 COLLECTED로 돌아간다', () => {
    expect(statusAfterUnarchive({ draftBody: null })).toBe('COLLECTED');
  });
});
```

`web/tests/delete-profile.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { deleteProfile } from '@/lib/profile/service';

describe('deleteProfile', () => {
  it('사진 파일을 모두 지운 뒤 행을 지운다', async () => {
    const order: string[] = [];
    const removeFile = vi.fn(async (key: string) => {
      order.push(`file:${key}`);
    });
    const deleteRow = vi.fn(async () => {
      order.push('row');
    });

    await deleteProfile('p1', {
      listKeys: async () => ['p1/a.png', 'p1/b.png'],
      removeFile,
      deleteRow,
    });

    expect(removeFile).toHaveBeenCalledTimes(2);
    expect(deleteRow).toHaveBeenCalledWith('p1');
    expect(order).toEqual(['file:p1/a.png', 'file:p1/b.png', 'row']);
  });

  it('사진이 없어도 행을 지운다', async () => {
    const deleteRow = vi.fn(async () => {});
    await deleteProfile('p1', {
      listKeys: async () => [],
      removeFile: vi.fn(),
      deleteRow,
    });
    expect(deleteRow).toHaveBeenCalledWith('p1');
  });

  it('파일 삭제가 실패해도 행은 지운다', async () => {
    const deleteRow = vi.fn(async () => {});
    await deleteProfile('p1', {
      listKeys: async () => ['p1/a.png'],
      removeFile: async () => {
        throw new Error('EACCES');
      },
      deleteRow,
    });
    expect(deleteRow).toHaveBeenCalledWith('p1');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd web && pnpm test tests/state.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/profile/state"`

- [ ] **Step 3: 상태 기계 구현**

`web/src/lib/profile/state.ts`:

```ts
import type { Status } from '@prisma/client';

export type Check = { ok: true } | { ok: false; reason: string };

function hasBody(body: string | null): boolean {
  return !!body && body.trim().length > 0;
}

export function canApprove(p: { finalBody: string | null; status: Status }): Check {
  if (p.status === 'ARCHIVED') return { ok: false, reason: '보관된 프로필은 승인할 수 없습니다.' };
  if (!hasBody(p.finalBody)) return { ok: false, reason: '게시 문구가 비어 있습니다.' };
  return { ok: true };
}

export function canPublish(p: { status: Status; finalBody: string | null }): Check {
  if (p.status === 'PUBLISHED') return { ok: false, reason: '이미 게시된 프로필입니다.' };
  if (p.status !== 'APPROVED') return { ok: false, reason: '승인된 프로필만 게시할 수 있습니다.' };
  if (!hasBody(p.finalBody)) return { ok: false, reason: '게시 문구가 비어 있습니다.' };
  return { ok: true };
}

// 승인 후 문구를 고치면 승인이 무효가 된다. 사람이 다시 봐야 한다.
export function statusAfterEdit(current: Status): Status {
  if (current === 'APPROVED') return 'DRAFTED';
  return current;
}

export function statusAfterUnarchive(p: { draftBody: string | null }): Status {
  return hasBody(p.draftBody) ? 'DRAFTED' : 'COLLECTED';
}
```

- [ ] **Step 4: 프로필 서비스 구현**

`web/src/lib/profile/service.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { removePhoto } from '@/lib/storage';
import type { Status } from '@prisma/client';

export async function findDuplicates(
  sourceHandle: string
): Promise<Array<{ id: string; status: Status; createdAt: Date }>> {
  return prisma.profile.findMany({
    where: { sourceHandle },
    select: { id: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export type DeleteDeps = {
  listKeys?: (id: string) => Promise<string[]>;
  removeFile?: (key: string) => Promise<void>;
  deleteRow?: (id: string) => Promise<void>;
};

// 행만 지우면 사진 파일이 고아로 남는다. 파일을 먼저 지우고 행을 지운다.
// 파일 삭제가 실패해도 행 삭제는 진행한다 — 남은 파일은 고아일 뿐이지만,
// 행이 남으면 사용자에게 지워지지 않은 것으로 보인다.
export async function deleteProfile(id: string, deps: DeleteDeps = {}): Promise<void> {
  const listKeys =
    deps.listKeys ??
    (async (profileId: string) => {
      const photos = await prisma.photo.findMany({
        where: { profileId },
        select: { storageKey: true },
      });
      return photos.map((p) => p.storageKey);
    });
  const removeFile = deps.removeFile ?? removePhoto;
  const deleteRow =
    deps.deleteRow ??
    (async (profileId: string) => {
      await prisma.profile.delete({ where: { id: profileId } });
    });

  for (const key of await listKeys(id)) {
    try {
      await removeFile(key);
    } catch (error) {
      console.warn('[profile] 사진 파일 삭제 실패', key, error);
    }
  }

  await deleteRow(id);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd web && pnpm test`
Expected: PASS — 전체 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/lib/profile web/tests/state.test.ts
git commit -m "feat: 승인 없이는 게시할 수 없게 하는 상태 기계"
```

---

### Task 8: API 라우트

**Files:**
- Create: `web/src/app/api/profiles/route.ts`, `web/src/app/api/profiles/[id]/route.ts`, `web/src/app/api/profiles/[id]/photos/route.ts`, `web/src/app/api/profiles/[id]/extract/route.ts`, `web/src/app/api/profiles/[id]/compose/route.ts`, `web/src/app/api/profiles/[id]/approve/route.ts`, `web/src/app/api/photos/[id]/route.ts`

**Interfaces:**
- Consumes: Task 2·4·5·6·7 전부
- Produces: 아래 엔드포인트

| 메서드 | 경로 | 용도 |
|---|---|---|
| `POST` | `/api/profiles` | 원문 입수. 중복 핸들이면 경고를 함께 돌려준다 |
| `GET` | `/api/profiles` | 목록 (상태 필터) |
| `PATCH` | `/api/profiles/:id` | 추출 필드·최종 문구 편집 |
| `DELETE` | `/api/profiles/:id` | 삭제 (사진 파일 포함) |
| `POST` | `/api/profiles/:id/photos` | 사진 업로드 |
| `POST` | `/api/profiles/:id/extract` | 추출 실행 |
| `POST` | `/api/profiles/:id/compose` | 작문 실행 |
| `POST` | `/api/profiles/:id/approve` | 승인 |
| `GET` | `/api/photos/:id` | 사진 제공 (인증 필요) |

- [ ] **Step 1: 입수·목록 라우트 작성**

`web/src/app/api/profiles/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { findDuplicates } from '@/lib/profile/service';

const createBody = z.object({
  sourceHandle: z.string().min(1),
  rawText: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = createBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '핸들과 원문이 필요합니다.' }, { status: 400 });
  }

  const handle = parsed.data.sourceHandle.trim().replace(/^@/, '');
  const duplicates = await findDuplicates(handle);

  const profile = await prisma.profile.create({
    data: { sourceHandle: handle, rawText: parsed.data.rawText },
    select: { id: true, status: true },
  });

  return NextResponse.json({ profile, duplicates }, { status: 201 });
}

export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get('status');
  const profiles = await prisma.profile.findMany({
    where: status ? { status: status as never } : { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      seq: true,
      status: true,
      sourceHandle: true,
      region: true,
      birthYear: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ profiles });
}
```

- [ ] **Step 2: 편집·삭제 라우트 작성**

`web/src/app/api/profiles/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { deleteProfile } from '@/lib/profile/service';
import { statusAfterEdit } from '@/lib/profile/state';

const patchBody = z.object({
  gender: z.enum(['F', 'M']).nullable().optional(),
  birthYear: z.number().int().nullable().optional(),
  region: z.string().nullable().optional(),
  heightCm: z.number().int().nullable().optional(),
  job: z.string().nullable().optional(),
  hobbies: z.array(z.string()).optional(),
  appealPoints: z.array(z.string()).optional(),
  idealType: z.array(z.string()).optional(),
  partnerBirthYearMin: z.number().int().nullable().optional(),
  partnerBirthYearMax: z.number().int().nullable().optional(),
  partnerRegions: z.array(z.string()).optional(),
  dealBreakers: z.array(z.string()).optional(),
  finalBody: z.string().nullable().optional(),
  status: z.enum(['ARCHIVED', 'DRAFTED', 'COLLECTED']).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = patchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const current = await prisma.profile.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!current) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const { status, ...fields } = parsed.data;
  const nextStatus = status ?? statusAfterEdit(current.status);

  const profile = await prisma.profile.update({
    where: { id },
    data: { ...fields, status: nextStatus },
  });
  return NextResponse.json({ profile });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await deleteProfile(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: 사진 업로드·제공 라우트 작성**

`web/src/app/api/profiles/[id]/photos/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assertUploadable, putPhoto } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({ where: { id }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const form = await request.formData();
  const files = form.getAll('photos').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: '사진이 없습니다.' }, { status: 400 });
  }

  const existing = await prisma.photo.count({ where: { profileId: id } });
  const saved: string[] = [];
  const failed: Array<{ name: string; reason: string }> = [];

  for (const [index, file] of files.entries()) {
    try {
      assertUploadable(file.type, file.size, existing + saved.length);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const storageKey = await putPhoto(id, bytes, file.type);
      const photo = await prisma.photo.create({
        data: {
          profileId: id,
          storageKey,
          contentType: file.type,
          bytes: file.size,
          order: existing + index,
        },
        select: { id: true },
      });
      saved.push(photo.id);
    } catch (error) {
      failed.push({ name: file.name, reason: (error as Error).message });
    }
  }

  return NextResponse.json({ saved, failed }, { status: failed.length ? 207 : 201 });
}
```

`web/src/app/api/photos/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readPhoto } from '@/lib/storage';

type Params = { params: Promise<{ id: string }> };

// 이 라우트는 미들웨어의 /api/* 매처에 걸려 인증을 요구한다.
// 사진에 공개 URL을 만들지 않는다.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return NextResponse.json({ error: '없는 사진입니다.' }, { status: 404 });

  try {
    const bytes = await readPhoto(photo.storageKey);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': photo.contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: '사진 파일을 찾을 수 없습니다.' }, { status: 404 });
  }
}
```

- [ ] **Step 4: 추출·작문·승인 라우트 작성**

`web/src/app/api/profiles/[id]/extract/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractFields } from '@/lib/llm/extract';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { rawText: true },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  try {
    const fields = await extractFields(profile.rawText);
    const updated = await prisma.profile.update({ where: { id }, data: fields });
    return NextResponse.json({ profile: updated });
  } catch (error) {
    // 추출 실패 시 상태를 바꾸지 않는다. 원문이 남아 있으니 다시 시도할 수 있다.
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
```

`web/src/app/api/profiles/[id]/compose/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { composeBody, type PhotoInput } from '@/lib/llm/compose';
import { readPhoto } from '@/lib/storage';
import { ExtractedSchema } from '@/lib/llm/extract';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const fields = ExtractedSchema.safeParse({
    gender: profile.gender,
    birthYear: profile.birthYear,
    region: profile.region,
    heightCm: profile.heightCm,
    job: profile.job,
    hobbies: profile.hobbies,
    appealPoints: profile.appealPoints,
    idealType: profile.idealType,
    partnerBirthYearMin: profile.partnerBirthYearMin,
    partnerBirthYearMax: profile.partnerBirthYearMax,
    partnerRegions: profile.partnerRegions,
    dealBreakers: profile.dealBreakers,
  });
  if (!fields.success) {
    return NextResponse.json(
      { error: '먼저 추출을 실행하거나 항목을 채워 주세요.' },
      { status: 400 }
    );
  }

  const photoInputs: PhotoInput[] = [];
  for (const photo of profile.photos) {
    try {
      const bytes = await readPhoto(photo.storageKey);
      photoInputs.push({
        contentType: photo.contentType,
        base64: Buffer.from(bytes).toString('base64'),
      });
    } catch (error) {
      console.warn('[compose] 사진 읽기 실패', photo.storageKey, error);
    }
  }

  try {
    const draftBody = await composeBody(fields.data, photoInputs);
    const updated = await prisma.profile.update({
      where: { id },
      data: {
        draftBody,
        // 최종본이 아직 없으면 초안을 그대로 채워 편집을 시작할 수 있게 한다.
        finalBody: profile.finalBody ?? draftBody,
        status: 'DRAFTED',
      },
    });
    return NextResponse.json({ profile: updated });
  } catch (error) {
    // 기존 초안을 보존한다.
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
```

`web/src/app/api/profiles/[id]/approve/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canApprove } from '@/lib/profile/state';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { finalBody: true, status: true },
  });
  if (!profile) return NextResponse.json({ error: '없는 프로필입니다.' }, { status: 404 });

  const check = canApprove(profile);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const updated = await prisma.profile.update({
    where: { id },
    data: { status: 'APPROVED' },
  });
  return NextResponse.json({ profile: updated });
}
```

- [ ] **Step 5: 타입 검사와 빌드 확인**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: 둘 다 통과

- [ ] **Step 6: 커밋**

```bash
git add web/src/app/api
git commit -m "feat: 프로필 입수·추출·작문·승인 API"
```

---

### Task 9: 관리자 화면

**Files:**
- Create: `web/src/app/admin/login/page.tsx`, `web/src/app/admin/page.tsx`, `web/src/app/admin/new/page.tsx`, `web/src/app/admin/profiles/[id]/page.tsx`, `web/src/app/admin/profiles/[id]/editor.tsx`

**Interfaces:**
- Consumes: Task 8의 API 전부
- Produces: 사용 가능한 관리자 UI

목록·상세는 서버 컴포넌트로 데이터를 읽고, 상호작용이 필요한 부분만 클라이언트 컴포넌트로 분리한다.

- [ ] **Step 1: 로그인 화면 작성**

`web/src/app/admin/login/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      router.push('/admin');
      router.refresh();
      return;
    }
    const data = await response.json().catch(() => ({}));
    setError(data.error ?? '로그인에 실패했습니다.');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-lg font-semibold">매칭 관리자</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="rounded-lg border border-neutral-700 bg-neutral-950 p-3"
          autoFocus
        />
        <button type="submit" className="rounded-lg bg-neutral-100 p-3 font-medium text-neutral-900">
          로그인
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 2: 목록 화면 작성**

`web/src/app/admin/page.tsx`:

```tsx
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

const STATUS_LABEL: Record<string, string> = {
  COLLECTED: '수집됨',
  DRAFTED: '초안',
  APPROVED: '승인됨',
  PUBLISHED: '게시됨',
  ARCHIVED: '보관',
};

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const profiles = await prisma.profile.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      seq: true,
      status: true,
      sourceHandle: true,
      region: true,
      birthYear: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">프로필 {profiles.length}건</h1>
        <Link href="/admin/new" className="rounded-lg bg-neutral-100 px-4 py-2 text-neutral-900">
          새로 입수
        </Link>
      </div>

      {profiles.length === 0 ? (
        <p className="text-neutral-500">아직 입수한 프로필이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/profiles/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900"
              >
                <span>
                  @{p.sourceHandle}
                  <span className="ml-2 text-neutral-500">
                    {p.region ?? '지역 미상'} · {p.birthYear ?? '연도 미상'}
                  </span>
                </span>
                <span className="text-sm text-neutral-400">
                  {p.seq ? `#${p.seq} · ` : ''}
                  {STATUS_LABEL[p.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: 입수 화면 작성**

`web/src/app/admin/new/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewProfilePage() {
  const router = useRouter();
  const [sourceHandle, setHandle] = useState('');
  const [rawText, setRawText] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const created = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceHandle, rawText }),
    });
    const data = await created.json().catch(() => ({}));
    if (!created.ok) {
      setMessage(data.error ?? '입수에 실패했습니다.');
      setBusy(false);
      return;
    }

    if (data.duplicates?.length) {
      setMessage(`같은 핸들의 프로필이 ${data.duplicates.length}건 있습니다. 확인해 주세요.`);
    }

    if (files && files.length > 0) {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('photos', file);
      const uploaded = await fetch(`/api/profiles/${data.profile.id}/photos`, {
        method: 'POST',
        body: form,
      });
      const result = await uploaded.json().catch(() => ({}));
      if (result.failed?.length) {
        setMessage(`사진 ${result.failed.length}장이 실패했습니다: ${result.failed[0].reason}`);
        setBusy(false);
        return;
      }
    }

    router.push(`/admin/profiles/${data.profile.id}`);
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-lg font-semibold">새 프로필 입수</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">스레드 핸들</span>
          <input
            value={sourceHandle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@handle"
            required
            className="rounded-lg border border-neutral-700 bg-neutral-950 p-3"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">DM 원문</span>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
            required
            className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 font-mono text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">사진 (최대 10장, 장당 10MB)</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFiles(e.target.files)}
            className="text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-neutral-100 p-3 font-medium text-neutral-900 disabled:opacity-50"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </form>
      {message && <p className="mt-4 text-sm text-amber-400">{message}</p>}
    </main>
  );
}
```

- [ ] **Step 4: 상세 화면 작성**

`web/src/app/admin/profiles/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ProfileEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.profile.findUnique({
    where: { id },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  if (!profile) notFound();

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">@{profile.sourceHandle}</h1>

        <div className="flex flex-wrap gap-2">
          {profile.photos.map((photo) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={photo.id}
              src={`/api/photos/${photo.id}`}
              alt=""
              className="h-40 w-40 rounded-lg object-cover"
            />
          ))}
        </div>

        <div>
          <h2 className="mb-2 text-sm text-neutral-400">DM 원문</h2>
          <pre className="whitespace-pre-wrap rounded-lg border border-neutral-800 p-4 text-sm">
            {profile.rawText}
          </pre>
        </div>
      </section>

      <ProfileEditor
        profile={{
          id: profile.id,
          status: profile.status,
          gender: profile.gender,
          birthYear: profile.birthYear,
          region: profile.region,
          heightCm: profile.heightCm,
          job: profile.job,
          hobbies: profile.hobbies,
          appealPoints: profile.appealPoints,
          idealType: profile.idealType,
          partnerBirthYearMin: profile.partnerBirthYearMin,
          partnerBirthYearMax: profile.partnerBirthYearMax,
          partnerRegions: profile.partnerRegions,
          dealBreakers: profile.dealBreakers,
          draftBody: profile.draftBody,
          finalBody: profile.finalBody,
        }}
      />
    </main>
  );
}
```

- [ ] **Step 5: 편집 컴포넌트 작성**

`web/src/app/admin/profiles/[id]/editor.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Profile = {
  id: string;
  status: string;
  gender: string | null;
  birthYear: number | null;
  region: string | null;
  heightCm: number | null;
  job: string | null;
  hobbies: string[];
  appealPoints: string[];
  idealType: string[];
  partnerBirthYearMin: number | null;
  partnerBirthYearMax: number | null;
  partnerRegions: string[];
  dealBreakers: string[];
  draftBody: string | null;
  finalBody: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  COLLECTED: '수집됨',
  DRAFTED: '초안',
  APPROVED: '승인됨',
  PUBLISHED: '게시됨',
  ARCHIVED: '보관',
};

export function ProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [body, setBody] = useState(profile.finalBody ?? '');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function call(path: string, init?: RequestInit, label = '') {
    setBusy(label);
    setMessage('');
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (!response.ok) {
      setMessage(data.error ?? '요청에 실패했습니다.');
      return null;
    }
    router.refresh();
    return data;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-neutral-700 px-3 py-1 text-sm">
          {STATUS_LABEL[profile.status]}
        </span>
        <button
          onClick={() => call(`/api/profiles/${profile.id}/extract`, { method: 'POST' }, 'extract')}
          disabled={!!busy}
          className="rounded-lg border border-neutral-700 px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy === 'extract' ? '추출 중…' : '추출 실행'}
        </button>
        <button
          onClick={() => call(`/api/profiles/${profile.id}/compose`, { method: 'POST' }, 'compose')}
          disabled={!!busy}
          className="rounded-lg border border-neutral-700 px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy === 'compose' ? '작문 중…' : '문구 작성'}
        </button>
      </div>

      <details className="rounded-lg border border-neutral-800 p-4">
        <summary className="cursor-pointer text-sm text-neutral-400">추출된 항목</summary>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-neutral-500">지역</dt>
          <dd>{profile.region ?? '—'}</dd>
          <dt className="text-neutral-500">출생연도</dt>
          <dd>{profile.birthYear ?? '—'}</dd>
          <dt className="text-neutral-500">키</dt>
          <dd>{profile.heightCm ? `${profile.heightCm}cm` : '—'}</dd>
          <dt className="text-neutral-500">직업</dt>
          <dd>{profile.job ?? '—'}</dd>
          <dt className="text-neutral-500">취미</dt>
          <dd>{profile.hobbies.join(', ') || '—'}</dd>
          <dt className="text-neutral-500">이상형 나이</dt>
          <dd>
            {profile.partnerBirthYearMin && profile.partnerBirthYearMax
              ? `${profile.partnerBirthYearMin}~${profile.partnerBirthYearMax}년생`
              : '—'}
          </dd>
        </dl>
      </details>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-neutral-400">게시 문구 (번호 없이 ✨로 시작)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={20}
          className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <button
          onClick={() =>
            call(
              `/api/profiles/${profile.id}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ finalBody: body }),
              },
              'save'
            )
          }
          disabled={!!busy}
          className="rounded-lg border border-neutral-700 px-4 py-2 disabled:opacity-50"
        >
          {busy === 'save' ? '저장 중…' : '문구 저장'}
        </button>

        <button
          onClick={async () => {
            const saved = await call(
              `/api/profiles/${profile.id}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ finalBody: body }),
              },
              'approve'
            );
            if (saved) await call(`/api/profiles/${profile.id}/approve`, { method: 'POST' }, 'approve');
          }}
          disabled={!!busy}
          className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 disabled:opacity-50"
        >
          {busy === 'approve' ? '승인 중…' : '저장하고 승인'}
        </button>

        <button
          onClick={async () => {
            if (!confirm('이 프로필과 사진을 모두 삭제할까요?')) return;
            const done = await call(`/api/profiles/${profile.id}`, { method: 'DELETE' }, 'delete');
            if (done) router.push('/admin');
          }}
          disabled={!!busy}
          className="ml-auto rounded-lg border border-red-900 px-4 py-2 text-red-400 disabled:opacity-50"
        >
          삭제
        </button>
      </div>

      {message && <p className="text-sm text-amber-400">{message}</p>}
    </section>
  );
}
```

- [ ] **Step 6: 빌드 확인**

Run: `cd web && pnpm typecheck && pnpm build`
Expected: 둘 다 통과

- [ ] **Step 7: 커밋**

```bash
git add web/src/app/admin
git commit -m "feat: 입수·검수·승인 관리자 화면"
```

---

### Task 10: 배포 설정과 문서

**Files:**
- Create: `web/Dockerfile`, `web/README.md`
- Modify: `web/docker-compose.yml`, `README.md` (루트)

**Interfaces:**
- Consumes: 완성된 앱
- Produces: `docker compose up` 으로 뜨는 배포 구성과 문서

- [ ] **Step 1: Dockerfile 작성**

`web/Dockerfile`:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate && pnpm build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["pnpm", "start"]
```

`web/public/.gitkeep` 을 만들어 빈 디렉터리를 커밋 가능하게 한다.

```bash
mkdir -p web/public && touch web/public/.gitkeep
```

- [ ] **Step 2: compose에 앱 서비스 추가**

`web/docker-compose.yml` 의 `services` 아래에 다음을 추가한다(`postgres` 는 그대로 둔다).

```yaml
  app:
    build: .
    container_name: matching_app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/matching
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      SESSION_SECRET: ${SESSION_SECRET}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      PHOTO_DIR: /data/photos
    ports:
      - "${APP_PORT:-3100}:3000"
    volumes:
      - photo_data:/data/photos
```

`volumes` 블록에 `photo_data:` 를 추가한다.

```yaml
volumes:
  postgres_data:
  photo_data:
```

- [ ] **Step 3: 사진 볼륨이 컨테이너 재시작을 견디는지 확인**

Run:

```bash
cd web && docker compose up -d --build && sleep 10
docker compose exec app sh -c "echo test > /data/photos/probe.txt"
docker compose restart app && sleep 10
docker compose exec app cat /data/photos/probe.txt
docker compose exec app rm /data/photos/probe.txt
```

Expected: `test` 가 출력된다. 출력되지 않으면 볼륨이 마운트되지 않은 것이다.

- [ ] **Step 4: 웹앱 README 작성**

`web/README.md`:

```markdown
# 매칭 관리자

스레드 DM으로 받은 자기소개를 정리해 게시용 문구를 만드는 관리자 웹앱입니다.

## 로컬 실행

```bash
cp .env.example .env
# SESSION_SECRET을 실제 랜덤 값으로 바꾸세요:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm dev
```

`http://localhost:3000/admin` 에서 `.env` 의 `ADMIN_PASSWORD` 로 로그인합니다.

## 사용 흐름

1. **새로 입수** — 스레드 핸들, DM 원문, 사진을 올립니다.
2. **추출 실행** — LLM이 원문에서 지역·출생연도·키·직업·취미·이상형 등을 뽑습니다. 원문에 없는 항목은 비워 둡니다.
3. **문구 작성** — 추출 항목과 사진을 함께 넣어 게시 문구 초안을 만듭니다.
4. **검수** — 초안을 읽고 고칩니다.
5. **저장하고 승인** — 승인된 문구만 게시할 수 있습니다.

승인 후 문구를 고치면 상태가 초안으로 돌아갑니다. 사람이 다시 봐야 하기 때문입니다.

## 배포

```bash
docker compose up -d --build
```

`ADMIN_PASSWORD`, `SESSION_SECRET`, `ANTHROPIC_API_KEY` 를 환경에 넣어야 합니다. 사진은 `photo_data` 볼륨에 남습니다.

## 개발

```bash
pnpm test        # Vitest
pnpm typecheck   # tsc --noEmit
```

LLM 호출은 테스트에서 주입으로 대체됩니다. 실제 응답 품질은 테스트로 검증하지 않습니다 — 검증 대상은 형식 준수와 상태 기계입니다.

## 알려진 한계

- 게시(서브시스템 3)와 매칭·전달(서브시스템 4)은 아직 없습니다. 승인된 문구는 손으로 복사해 올려야 합니다.
- 게시 번호는 게시 시점에 발급하도록 설계했으므로, 지금은 부여되지 않습니다.
- 운영자는 한 명을 전제합니다. 계정이 하나뿐이고 권한 구분이 없습니다.
```

- [ ] **Step 5: 루트 README 갱신**

루트 `README.md` 의 맨 위 제목을 `# 사기꾼 — 스레드 소개팅 운영 도구` 로 바꾸고, 제목 바로 아래에 다음 절을 넣는다. 기존 확장 관련 내용은 그 아래에 그대로 둔다(설치 경로만 `sagiggun/extension` 으로 수정).

```markdown
저장소는 두 부분입니다.

| 디렉터리 | 내용 |
|---|---|
| [`extension/`](extension) | threads.com 입력창에 저장된 문구를 넣는 크롬/Edge 확장 |
| [`web/`](web) | 자기소개를 수집해 게시 문구를 만드는 관리자 웹앱 ([사용법](web/README.md)) |

스레드 API에는 DM을 보내거나 읽는 엔드포인트가 없습니다. 게시는 서버에서 API로 할 수 있지만 DM은 브라우저를 거쳐야 하고, 그래서 확장이 이 시스템의 메시지 전달 계층입니다. 근거는 [설계 문서](docs/superpowers/specs/2026-08-09-matching-intake-design.md)에 있습니다.
```

- [ ] **Step 6: 전체 검증**

Run:

```bash
cd extension && npm test && cd ../web && pnpm test && pnpm typecheck && pnpm build
```

Expected: 확장 104개 통과, 웹앱 테스트 전부 통과, 타입 검사와 빌드 통과

- [ ] **Step 7: 인증 게이트 수동 검증**

미들웨어는 단위 테스트로 덮지 않았으므로 실제로 확인한다. `pnpm dev` 를 띄운 상태에서:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/profiles
```

Expected: `401`

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/admin
```

Expected: `307` 이고 리다이렉트 대상이 `/admin/login`

브라우저에서 `/admin/login` 으로 로그인한 뒤 `/admin` 이 열리는지, 사진 URL(`/api/photos/<id>`)이 로그인 상태에서만 열리는지 확인한다. 시크릿 창에서 같은 사진 URL을 열면 401이 나와야 한다.

- [ ] **Step 8: LLM 왕복 수동 검증**

실제 DM 원문 한 건으로 전 과정을 돌린다. 자동 테스트는 LLM을 주입으로 대체하므로 실제 호출은 여기서 처음 확인된다.

1. `/admin/new` 에서 실제 원문과 사진 2장을 올린다.
2. **추출 실행** — 지역·출생연도·키·직업이 원문과 일치하는지, 원문에 없는 항목이 비어 있는지 확인한다(지어내면 프롬프트를 고쳐야 한다).
3. **문구 작성** — 결과가 `✨` 로 시작하는지, 맨 앞에 번호가 없는지, 필수 표지가 모두 있는지 확인한다.
4. 문구를 고치고 **저장하고 승인** — 상태가 `승인됨` 으로 바뀌는지 확인한다.
5. 승인 후 문구를 다시 고쳐 저장하면 상태가 `초안` 으로 내려가는지 확인한다.
6. 삭제 후 `web/.photos/<프로필id>/` 디렉터리의 파일이 사라졌는지 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "feat: docker 배포 설정과 문서"
```

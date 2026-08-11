import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  parseBearerToken,
  verifyOpsApiToken,
  verifySessionToken,
} from '@/lib/auth';

// 로그인 페이지로 리다이렉트할 경로를 상수 하나로만 정의한다. PUBLIC_PATHS도
// 이 상수를 참조하게 해서, "누군가 PUBLIC_PATHS를 잘못 고치면 조용히 fail-open된다"는
// 리뷰 지적(Fix round 1 — Important 3)이 지목한 실패 지점(문자열이 두 곳에 따로
// 적혀 있어 하나만 바뀌는 것)을 애초에 없앤다.
const LOGIN_PATH = '/admin/login';
const PUBLIC_PATHS = [LOGIN_PATH, '/api/auth/login'];
// /api/public/ 아래는 익명 신청·관심 접수 전용 네임스페이스다. 여기에 두는 라우트는
// "의도적으로 공개"라는 선언이며, 각 라우트가 자체 rate limit·검증을 책임진다.
const PUBLIC_API_PREFIX = '/api/public/';
const DEFAULT_EXTENSION_CORS_ORIGINS = [
  'https://www.threads.com',
  'https://threads.com',
  'https://www.threads.net',
  'https://threads.net',
];

export function extensionCorsOrigin(origin: string | null, configured?: string): string | null {
  if (!origin) return null;
  const allowed = new Set(
    (configured?.trim() ? configured.split(',') : DEFAULT_EXTENSION_CORS_ORIGINS)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return allowed.has(origin) ? origin : null;
}

function withCors(response: NextResponse, origin: string | null, preflight = false): NextResponse {
  if (!origin) return response;
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
  if (preflight) {
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.headers.set('Access-Control-Max-Age', '600');
  }
  return response;
}

export type GateDecision = { kind: 'allow' } | { kind: 'unauthorized' } | { kind: 'redirect'; to: string };

export type GateInput = {
  pathname: string;
  sessionSecret: string | undefined;
  sessionToken: string;
  /** 설정된 OPS_API_TOKEN. 비어 있으면 Bearer 비활성. */
  opsApiToken?: string | null;
  /** Authorization 헤더에서 뽑은 Bearer 토큰 (없으면 ''). */
  bearerToken?: string;
};

// middleware()의 판정 로직 전체. NextRequest/NextResponse에 기대지 않는 순수 함수라
// vitest(Node 환경)에서 Edge 런타임을 흉내 낼 필요 없이 바로 테스트할 수 있다
// (Fix round 1 — Important 3). web/tests/middleware.test.ts 참고.
export async function evaluateGate(
  pathnameOrInput: string | GateInput,
  secret?: string | undefined,
  token?: string,
  opsApiToken?: string | null,
  bearerToken?: string
): Promise<GateDecision> {
  const input: GateInput =
    typeof pathnameOrInput === 'string'
      ? {
          pathname: pathnameOrInput,
          sessionSecret: secret,
          sessionToken: token ?? '',
          opsApiToken,
          bearerToken,
        }
      : pathnameOrInput;

  const { pathname } = input;
  if (PUBLIC_PATHS.includes(pathname)) return { kind: 'allow' };
  if (pathname.startsWith(PUBLIC_API_PREFIX)) return { kind: 'allow' };

  const sessionOk =
    !!input.sessionSecret &&
    (await verifySessionToken(input.sessionSecret, input.sessionToken, Date.now()));
  if (sessionOk) return { kind: 'allow' };

  // Bearer는 /api/* 만. 관리 HTML은 세션 필수.
  if (
    pathname.startsWith('/api/') &&
    verifyOpsApiToken(input.opsApiToken, input.bearerToken ?? '')
  ) {
    return { kind: 'allow' };
  }

  if (pathname.startsWith('/api/')) return { kind: 'unauthorized' };
  return { kind: 'redirect', to: LOGIN_PATH };
}

// middleware() 자체는 evaluateGate()의 판정을 NextResponse로 옮기기만 하는 얇은
// 래퍼다 — 실제 인증 판단 로직은 전부 evaluateGate()에 있다.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const corsOrigin = extensionCorsOrigin(
    request.headers.get('origin'),
    process.env.EXTENSION_CORS_ORIGINS
  );

  if (pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    if (request.headers.has('origin') && !corsOrigin) {
      return NextResponse.json({ error: '허용되지 않은 origin입니다.' }, { status: 403 });
    }
    return withCors(new NextResponse(null, { status: 204 }), corsOrigin, true);
  }

  const secret = process.env.SESSION_SECRET;
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value ?? '';
  const opsApiToken = process.env.OPS_API_TOKEN?.trim() || null;
  const bearerToken = parseBearerToken(request.headers.get('authorization'));

  const decision = await evaluateGate({
    pathname,
    sessionSecret: secret,
    sessionToken,
    opsApiToken: opsApiToken && opsApiToken.length >= 16 ? opsApiToken : null,
    bearerToken,
  });

  switch (decision.kind) {
    case 'allow':
      return withCors(NextResponse.next(), corsOrigin);
    case 'unauthorized':
      return withCors(
        NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
        corsOrigin
      );
    case 'redirect': {
      const url = request.nextUrl.clone();
      url.pathname = decision.to;
      url.search = '';
      return withCors(NextResponse.redirect(url), corsOrigin);
    }
  }
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};

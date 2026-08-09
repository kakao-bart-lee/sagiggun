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
      return NextResponse.next();
    case 'unauthorized':
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    case 'redirect': {
      const url = request.nextUrl.clone();
      url.pathname = decision.to;
      url.search = '';
      return NextResponse.redirect(url);
    }
  }
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};

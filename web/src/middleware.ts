import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// 로그인 페이지로 리다이렉트할 경로를 상수 하나로만 정의한다. PUBLIC_PATHS도
// 이 상수를 참조하게 해서, "누군가 PUBLIC_PATHS를 잘못 고치면 조용히 fail-open된다"는
// 리뷰 지적(Fix round 1 — Important 3)이 지목한 실패 지점(문자열이 두 곳에 따로
// 적혀 있어 하나만 바뀌는 것)을 애초에 없앤다.
const LOGIN_PATH = '/admin/login';
const PUBLIC_PATHS = [LOGIN_PATH, '/api/auth/login'];

export type GateDecision = { kind: 'allow' } | { kind: 'unauthorized' } | { kind: 'redirect'; to: string };

// middleware()의 판정 로직 전체. NextRequest/NextResponse에 기대지 않는 순수 함수라
// vitest(Node 환경)에서 Edge 런타임을 흉내 낼 필요 없이 바로 테스트할 수 있다
// (Fix round 1 — Important 3). web/tests/middleware.test.ts 참고.
export async function evaluateGate(
  pathname: string,
  secret: string | undefined,
  token: string
): Promise<GateDecision> {
  if (PUBLIC_PATHS.includes(pathname)) return { kind: 'allow' };

  // secret이 비어 있으면(설정 누락) 어떤 토큰이 와도 통과시키지 않는다 — fail-closed.
  const ok = !!secret && (await verifySessionToken(secret, token, Date.now()));
  if (ok) return { kind: 'allow' };

  if (pathname.startsWith('/api/')) return { kind: 'unauthorized' };
  return { kind: 'redirect', to: LOGIN_PATH };
}

// middleware() 자체는 evaluateGate()의 판정을 NextResponse로 옮기기만 하는 얇은
// 래퍼다 — 실제 인증 판단 로직은 전부 evaluateGate()에 있다.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = process.env.SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? '';

  const decision = await evaluateGate(pathname, secret, token);

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

import { describe, it, expect } from 'vitest';
import { evaluateGate, extensionCorsOrigin } from '@/middleware';
import { createSessionToken } from '@/lib/auth';

const SECRET = 'a'.repeat(32);

// middleware()가 아니라 evaluateGate()를 테스트한다. evaluateGate()는 middleware.ts가
// 내보내는 순수 판정 함수이고, middleware() 자체는 이 함수의 결과를 NextResponse로
// 옮기기만 하는 얇은 래퍼다(middleware.ts 참고). 즉 여기서 검증하는 것은 "미들웨어가
// 실행됐을 때 어떤 판정을 내리는가"이지 "matcher 설정 때문에 미들웨어가 애초에
// 실행되는가"가 아니다 — 후자(경로별로 실제 요청이 미들웨어까지 도달하는지)는
// Next.js 라우터가 소비하는 config.matcher의 몫이라 vitest로 검증할 수 없고,
// task-3-report.md의 수동 curl 왕복 검증으로 확인했다.
describe('evaluateGate — 미들웨어 게이트 판정', () => {
  it('세션 쿠키 없이 /api/* 에 접근하면 401(unauthorized)이다', async () => {
    expect(await evaluateGate('/api/profiles', SECRET, '')).toEqual({ kind: 'unauthorized' });
  });

  it('세션 쿠키 없이 /admin/* 에 접근하면 /admin/login으로 리다이렉트한다', async () => {
    expect(await evaluateGate('/admin/profiles', SECRET, '')).toEqual({
      kind: 'redirect',
      to: '/admin/login',
    });
    // bare "/admin"도 동일해야 한다 (matcher '/admin/:path*'가 실제로 이 경로도
    // 넘겨준다는 것은 task-3-report.md의 curl 검증(A)에서 확인됨).
    expect(await evaluateGate('/admin', SECRET, '')).toEqual({ kind: 'redirect', to: '/admin/login' });
  });

  it('/admin/login, /api/auth/login은 인증 없이 통과한다', async () => {
    expect(await evaluateGate('/admin/login', SECRET, '')).toEqual({ kind: 'allow' });
    expect(await evaluateGate('/api/auth/login', SECRET, '')).toEqual({ kind: 'allow' });
  });

  it('유효한 세션 쿠키가 있으면 통과한다', async () => {
    const token = await createSessionToken(SECRET, Date.now() + 60_000);
    expect(await evaluateGate('/admin/profiles', SECRET, token)).toEqual({ kind: 'allow' });
    expect(await evaluateGate('/api/profiles', SECRET, token)).toEqual({ kind: 'allow' });
  });

  it('SESSION_SECRET이 설정되지 않으면 유효해 보이는 쿠키가 있어도 막는다 (fail-closed)', async () => {
    // SECRET으로 정상 발급된, 형식상 멀쩡한 토큰이어도 서버에 secret 자체가 없으면
    // (배포 설정 누락 등) 통과시키지 않아야 한다.
    const token = await createSessionToken(SECRET, Date.now() + 60_000);
    expect(await evaluateGate('/api/profiles', undefined, token)).toEqual({ kind: 'unauthorized' });
    expect(await evaluateGate('/admin/profiles', undefined, token)).toEqual({
      kind: 'redirect',
      to: '/admin/login',
    });
  });

  it('유효한 OPS Bearer면 /api/* 만 통과하고 /admin은 막는다', async () => {
    const ops = 'ops-token-16chars';
    expect(
      await evaluateGate('/api/profiles', SECRET, '', ops, ops)
    ).toEqual({ kind: 'allow' });
    expect(
      await evaluateGate('/admin/profiles', SECRET, '', ops, ops)
    ).toEqual({ kind: 'redirect', to: '/admin/login' });
  });

  it('잘못된 Bearer는 막는다', async () => {
    expect(
      await evaluateGate('/api/profiles', SECRET, '', 'ops-token-16chars', 'wrong-token-xxxxx')
    ).toEqual({ kind: 'unauthorized' });
  });
});

describe('extensionCorsOrigin — 확장 preflight 경계', () => {
  it('Threads origin만 기본 허용한다', () => {
    expect(extensionCorsOrigin('https://www.threads.com')).toBe('https://www.threads.com');
    expect(extensionCorsOrigin('https://threads.net')).toBe('https://threads.net');
    expect(extensionCorsOrigin('https://evil.example')).toBeNull();
  });

  it('배포 환경에서 명시한 origin 목록을 사용할 수 있다', () => {
    expect(extensionCorsOrigin('https://ops.example', 'https://ops.example, https://other.example'))
      .toBe('https://ops.example');
    expect(extensionCorsOrigin('https://www.threads.com', 'https://ops.example')).toBeNull();
  });
});

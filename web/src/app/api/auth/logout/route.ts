import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST() {
  // 주의(Fix round 1 — Important 4, 문서화만): 이 쿠키 삭제는 클라이언트(브라우저)
  // 쪽 상태만 지운다. 토큰은 스스로 폐기되지 않는 stateless HMAC 서명이라, 이미
  // 유출된 토큰은 로그아웃과 무관하게 자신의 만료시각까지 계속 유효하다. 유출된
  // 토큰을 즉시 무효화하려면 SESSION_SECRET을 교체해야 한다(그러면 발급된 모든
  // 토큰이 함께 무효화된다 — 그 순간 로그인된 모든 세션도 함께 끊긴다).
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}

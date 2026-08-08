import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { SESSION_COOKIE, SESSION_TTL_MS, createSessionToken, timingSafeEqual } from '@/lib/auth';
import { checkRateLimit, getClientIp, recordLoginFailure, recordLoginSuccess } from '@/lib/rate-limit';

const body = z.object({ password: z.string() });

export async function POST(request: Request) {
  const env = getEnv();
  const ip = getClientIp(request);
  const now = Date.now();

  // 본문을 파싱하기 전에 먼저 확인한다 — 잠긴 클라이언트에게는 JSON 파싱조차
  // 하지 않는다.
  const rateLimit = checkRateLimit(ip, now);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) } }
    );
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  // 일반 문자열 비교(!==) 대신 상수시간 비교를 쓴다 (Fix round 1 — Important 1).
  if (!timingSafeEqual(parsed.data.password, env.adminPassword)) {
    recordLoginFailure(ip, now);
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  recordLoginSuccess(ip);

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

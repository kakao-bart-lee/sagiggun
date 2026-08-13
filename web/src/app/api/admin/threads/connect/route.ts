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

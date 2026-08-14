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

  // request.url을 리다이렉트 기준으로 쓰면 리버스 프록시/터널(ngrok 등) 뒤에서 Next.js가 내부
  // 호스트(예: localhost:3000)로 잘못 해석해 엉뚱한 주소로 리다이렉트한다. Meta에 등록한
  // THREADS_REDIRECT_URI가 이 앱의 진짜 공개 주소이므로 그 origin을 기준으로 쓴다.
  const appOrigin = new URL(env.threadsRedirectUri).origin;

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
        new URL(`/admin/settings?threadsError=${encodeURIComponent(message)}`, appOrigin)
      )
    );
  }

  return withClearedStateCookie(
    NextResponse.redirect(new URL('/admin/settings?threadsConnected=1', appOrigin))
  );
}

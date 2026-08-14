import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  afterEach(() => vi.useRealTimers());

  it('state가 쿠키와 다르면 400이고 아무 것도 저장하지 않는다', async () => {
    const { saveThreadsAccount } = await import('@/lib/threads/account');
    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=wrong', `${THREADS_OAUTH_STATE_COOKIE}=expected`);
    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(saveThreadsAccount).not.toHaveBeenCalled();
    // state 불일치로 거부하는 응답도 leftover state 쿠키를 남기면 재사용(replay) 위험이 있다 —
    // 모든 응답 경로에서 지워야 한다는 게 이 라우트의 불변 조건이다.
    const clearedCookie = response.cookies.get(THREADS_OAUTH_STATE_COOKIE);
    expect(clearedCookie?.value).toBe('');
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
    const fixedNow = new Date('2026-01-01T00:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

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
      expect.objectContaining({
        threadsUserId: 'u1',
        username: 'handle',
        accessToken: 'long',
        tokenExpiresAt: new Date(fixedNow + 5_183_944 * 1000),
      })
    );
  });

  it('username 조회가 실패해도 계정은 저장하고 설정 화면으로 리다이렉트한다', async () => {
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
    // 토큰 교환은 이미 성공했다(1회용 code도 이미 소비됨) — 그 뒤 /me 조회만 실패하는
    // 시나리오. 이 실패가 전체 연결을 무산시키면 안 된다(route.ts의 `.catch(() => null)`).
    (fetchThreadsUsername as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('profile fetch failed')
    );
    const { saveThreadsAccount } = await import('@/lib/threads/account');

    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=expected', `${THREADS_OAUTH_STATE_COOKIE}=expected`);
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/admin/settings?threadsConnected=1');
    expect(saveThreadsAccount).toHaveBeenCalledWith(
      expect.objectContaining({ threadsUserId: 'u1', username: null, accessToken: 'long' })
    );
  });

  it('리다이렉트는 요청 호스트가 아니라 THREADS_REDIRECT_URI의 origin을 기준으로 만든다', async () => {
    // 이 요청은 http://localhost에서 온 것으로 보이지만(reverse proxy·터널 뒤에서 Next.js가
    // 흔히 내부 호스트를 그렇게 잘못 본다), 실제 공개 주소는 threadsRedirectUri인
    // https://example.com이다. request.url을 기준으로 리다이렉트를 만들면 브라우저가
    // 존재하지 않는 내부 호스트로 튕겨 나간다 — 실제로 겪은 버그.
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

    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=expected', `${THREADS_OAUTH_STATE_COOKIE}=expected`);
    const response = await GET(request);

    expect(response.headers.get('location')).toBe('https://example.com/admin/settings?threadsConnected=1');
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
    // 성공 경로와 마찬가지로 request.url이 아니라 threadsRedirectUri의 origin을 써야 한다 —
    // 이 요청은 http://localhost에서 온 것으로 보이지만 실제 공개 주소는 https://example.com이다.
    expect(response.headers.get('location')).toBe(
      `https://example.com/admin/settings?threadsError=${encodeURIComponent('코드가 이미 사용됐습니다.')}`
    );
    expect(saveThreadsAccount).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('state가 쿠키와 다르면 400이고 아무 것도 저장하지 않는다', async () => {
    const { saveThreadsAccount } = await import('@/lib/threads/account');
    const { GET } = await import('@/app/api/admin/threads/callback/route');
    const request = callbackRequest('?code=abc&state=wrong', `${THREADS_OAUTH_STATE_COOKIE}=expected`);
    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(saveThreadsAccount).not.toHaveBeenCalled();
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
      expect.objectContaining({ threadsUserId: 'u1', username: 'handle', accessToken: 'long' })
    );
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
    expect(response.headers.get('location')).toContain('threadsError=');
    expect(saveThreadsAccount).not.toHaveBeenCalled();
  });
});

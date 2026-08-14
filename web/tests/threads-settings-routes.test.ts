import { describe, it, expect, vi, beforeEach } from 'vitest';
import { THREADS_OAUTH_STATE_COOKIE } from '@/lib/threads/state-cookie';

vi.mock('@/lib/env', () => ({ getEnv: vi.fn() }));
vi.mock('@/lib/threads/account', () => ({
  getThreadsAccount: vi.fn(),
  clearThreadsAccount: vi.fn(),
}));

describe('GET /api/admin/threads/connect', () => {
  beforeEach(() => vi.clearAllMocks());

  it('앱 설정이 없으면 503', async () => {
    const { getEnv } = await import('@/lib/env');
    (getEnv as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      threadsAppId: null,
      threadsRedirectUri: null,
    });
    const { GET } = await import('@/app/api/admin/threads/connect/route');
    const response = await GET();
    expect(response.status).toBe(503);
  });

  it('앱 설정이 있으면 authorize URL로 리다이렉트하고 state 쿠키를 심는다', async () => {
    const { getEnv } = await import('@/lib/env');
    (getEnv as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      threadsAppId: 'app123',
      threadsRedirectUri: 'https://example.com/api/admin/threads/callback',
    });
    const { GET } = await import('@/app/api/admin/threads/connect/route');
    const response = await GET();
    expect(response.status).toBe(307);
    const location = response.headers.get('location') ?? '';
    expect(location).toContain('https://threads.net/oauth/authorize');
    expect(location).toContain('client_id=app123');
    const stateCookie = response.cookies.get(THREADS_OAUTH_STATE_COOKIE);
    expect(stateCookie?.value).toBeTruthy();
  });
});

describe('GET /api/admin/threads/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('연결 안 됐으면 connected: false만 준다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import('@/app/api/admin/threads/status/route');
    const response = await GET();
    expect(await response.json()).toEqual({ connected: false });
  });

  it('연결됐으면 username·만료일을 주고 토큰 원문은 절대 안 준다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      threadsUserId: 'u1',
      username: 'handle',
      accessToken: 'super-secret-token',
      tokenExpiresAt: new Date('2026-10-01T00:00:00Z'),
    });
    const { GET } = await import('@/app/api/admin/threads/status/route');
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual({
      connected: true,
      username: 'handle',
      tokenExpiresAt: '2026-10-01T00:00:00.000Z',
    });
    expect(JSON.stringify(body)).not.toContain('super-secret-token');
  });
});

describe('POST /api/admin/threads/disconnect', () => {
  it('저장된 연결을 지운다', async () => {
    const { clearThreadsAccount } = await import('@/lib/threads/account');
    const { POST } = await import('@/app/api/admin/threads/disconnect/route');
    const response = await POST();
    expect(response.status).toBe(200);
    expect(clearThreadsAccount).toHaveBeenCalledTimes(1);
  });
});

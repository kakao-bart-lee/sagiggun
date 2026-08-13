import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  fetchThreadsUsername,
  publishThreadsPost,
  ThreadsApiError,
} from '@/lib/threads/client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildAuthorizeUrl', () => {
  it('client_id·redirect_uri·scope·state를 포함한 authorize URL을 만든다', () => {
    const url = buildAuthorizeUrl({
      appId: 'app123',
      redirectUri: 'https://example.com/api/admin/threads/callback',
      state: 'nonce-1',
    });
    expect(url).toContain('https://threads.net/oauth/authorize?');
    expect(url).toContain('client_id=app123');
    expect(url).toContain('response_type=code');
    expect(url).toContain('state=nonce-1');
    expect(decodeURIComponent(url)).toContain('scope=threads_basic,threads_content_publish');
    expect(decodeURIComponent(url)).toContain(
      'redirect_uri=https://example.com/api/admin/threads/callback'
    );
  });
});

describe('exchangeCodeForToken', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('성공하면 access token과 user id를 돌려준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'short-token', user_id: 17841405793187218 }));
    const result = await exchangeCodeForToken({
      appId: 'app123',
      appSecret: 'secret123',
      code: 'auth-code',
      redirectUri: 'https://example.com/callback',
    });
    expect(result).toEqual({ accessToken: 'short-token', userId: '17841405793187218' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.threads.net/oauth/access_token',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('실패하면 Threads의 error_message를 담아 ThreadsApiError를 던진다', async () => {
    // mockResolvedValue는 Response 인스턴스를 한 번만 만들어 매 호출에 재사용하는데, Response
    // body는 한 번만 읽을 수 있다. 아래에서 exchangeCodeForToken을 두 번 호출하므로
    // mockImplementation으로 매 호출마다 새 Response를 만들어야 두 번째 호출도 body를 읽을 수 있다.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { error_type: 'OAuthException', code: 400, error_message: '이미 사용된 코드입니다.' },
          400
        )
      )
    );
    await expect(
      exchangeCodeForToken({
        appId: 'app123',
        appSecret: 'secret123',
        code: 'used-code',
        redirectUri: 'https://example.com/callback',
      })
    ).rejects.toThrow(ThreadsApiError);
    await expect(
      exchangeCodeForToken({
        appId: 'app123',
        appSecret: 'secret123',
        code: 'used-code',
        redirectUri: 'https://example.com/callback',
      })
    ).rejects.toThrow('이미 사용된 코드입니다.');
  });
});

describe('exchangeForLongLivedToken', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('장기 토큰과 만료 초를 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'long-token', token_type: 'bearer', expires_in: 5183944 })
    );
    const result = await exchangeForLongLivedToken({ appSecret: 'secret123', accessToken: 'short-token' });
    expect(result).toEqual({ accessToken: 'long-token', expiresInSeconds: 5183944 });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('https://graph.threads.net/access_token?');
    expect(calledUrl).toContain('grant_type=th_exchange_token');
  });
});

describe('refreshLongLivedToken', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('갱신된 토큰과 만료 초를 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'refreshed-token', token_type: 'bearer', expires_in: 5183944 })
    );
    const result = await refreshLongLivedToken({ accessToken: 'long-token' });
    expect(result).toEqual({ accessToken: 'refreshed-token', expiresInSeconds: 5183944 });
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('https://graph.threads.net/refresh_access_token?');
    expect(calledUrl).toContain('grant_type=th_refresh_token');
  });
});

describe('fetchThreadsUsername', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('username을 돌려준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '17841405793187218', username: 'threadsapitestuser' }));
    expect(await fetchThreadsUsername({ accessToken: 'long-token' })).toBe('threadsapitestuser');
  });

  it('username이 없으면 null', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: '17841405793187218' }));
    expect(await fetchThreadsUsername({ accessToken: 'long-token' })).toBeNull();
  });
});

describe('publishThreadsPost', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('container 생성 후 즉시 publish가 성공하면 post id를 돌려준다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' })) // POST /threads
      .mockResolvedValueOnce(jsonResponse({ id: 'post-1' })); // POST /threads_publish

    const postId = await publishThreadsPost({
      accessToken: 'token',
      threadsUserId: 'u1',
      text: '✨ 본문',
    });

    expect(postId).toBe('post-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://graph.threads.net/v1.0/u1/threads');
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://graph.threads.net/v1.0/u1/threads_publish'
    );
  });

  it('publish가 아직 준비 안 됐으면(IN_PROGRESS) 상태를 확인하고 재시도한다', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' })) // container 생성
      .mockResolvedValueOnce(jsonResponse({ error: { message: '아직 처리 중' } }, 400)) // 1차 publish 실패
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS', id: 'container-1' })) // 상태 확인
      .mockResolvedValueOnce(jsonResponse({ id: 'post-1' })); // 2차 publish 성공

    const promise = publishThreadsPost({ accessToken: 'token', threadsUserId: 'u1', text: '✨ 본문' });
    await vi.advanceTimersByTimeAsync(3_000);
    const postId = await promise;

    expect(postId).toBe('post-1');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('container 상태가 ERROR면 그 error_message로 ThreadsApiError를 던진다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: '실패' } }, 400))
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ERROR', id: 'container-1', error_message: 'FAILED_PROCESSING' })
      );

    await expect(
      publishThreadsPost({ accessToken: 'token', threadsUserId: 'u1', text: '✨ 본문' })
    ).rejects.toThrow('FAILED_PROCESSING');
  });
});

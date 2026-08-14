import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  fetchThreadsUsername,
  fetchThreadsPermalink,
  publishThreadsPost,
  deleteThreadsPost,
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
    expect(decodeURIComponent(url)).toContain(
      'scope=threads_basic,threads_content_publish,threads_delete'
    );
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

describe('fetchThreadsPermalink', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('permalink을 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: 'post-1', permalink: 'https://www.threads.com/@handle/post/abc123' })
    );
    const result = await fetchThreadsPermalink({ accessToken: 'token', postId: 'post-1' });
    expect(result).toBe('https://www.threads.com/@handle/post/abc123');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.threads.net/v1.0/post-1?fields=permalink&access_token=token',
      expect.anything()
    );
  });

  it('permalink이 없으면 null', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'post-1' }));
    expect(await fetchThreadsPermalink({ accessToken: 'token', postId: 'post-1' })).toBeNull();
  });

  it('실패하면 ThreadsApiError를 던진다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: '조회 실패' } }, 400));
    await expect(
      fetchThreadsPermalink({ accessToken: 'token', postId: 'post-1' })
    ).rejects.toThrow('조회 실패');
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

    const containerInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(containerInit.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(String(containerInit.body)).toContain('media_type=TEXT');
    // '✨ 본문'을 URLSearchParams로 인코딩한 결과 — createTextContainer가 text를 폼 바디에
    // 실제로 실어 보내는지 확인한다.
    expect(String(containerInit.body)).toContain('text=%E2%9C%A8+%EB%B3%B8%EB%AC%B8');

    const publishInit = fetchMock.mock.calls[1][1] as RequestInit;
    // container 생성 응답이 돌려준 id('container-1')가 그대로 publish 요청의 creation_id로
    // 전달되는지 확인 — 2단계 흐름의 핵심 연결고리.
    expect(String(publishInit.body)).toContain('creation_id=container-1');
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

  it('publish 자체가 거절되고 container는 FINISHED면(예: 250건 초과) 재시도 없이 그 error_message로 즉시 던진다', async () => {
    // container 처리 자체는 정상 끝났는데(FINISHED) publish 호출만 별도 이유로 거절된 경우 —
    // 예: 하루 250건 게시 한도 초과. containerStatus에는 error_message가 없으므로(§8: 컨테이너는
    // 문제없이 처리됐다), publish 단계에서 잡은 진짜 에러를 그대로 던져야 한다. 재시도로 넘어가
    // 남은 시도를 낭비하고 그 에러를 잃어버리면 안 된다. 아래는 (수정 전 버그가 있는 코드라면)
    // 3번 다 재시도해서 소진할 만큼 응답을 채워 둔다 — 고쳐지면 1차 시도 후 곧바로 던지므로
    // 뒤의 응답들은 쓰이지 않아야 한다.
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' })) // container 생성
      .mockResolvedValueOnce(jsonResponse({ error_message: '일일 게시 한도를 초과했습니다.' }, 400)) // 1차 publish 거절
      .mockResolvedValueOnce(jsonResponse({ status: 'FINISHED', id: 'container-1' })) // 1차 상태 확인 — container는 정상
      .mockResolvedValueOnce(jsonResponse({ error_message: '일일 게시 한도를 초과했습니다.' }, 400)) // 2차 publish 거절
      .mockResolvedValueOnce(jsonResponse({ status: 'FINISHED', id: 'container-1' })) // 2차 상태 확인
      .mockResolvedValueOnce(jsonResponse({ error_message: '일일 게시 한도를 초과했습니다.' }, 400)) // 3차 publish 거절
      .mockResolvedValueOnce(jsonResponse({ status: 'FINISHED', id: 'container-1' })); // 3차 상태 확인

    const promise = publishThreadsPost({ accessToken: 'token', threadsUserId: 'u1', text: '✨ 본문' });
    const assertion = expect(promise).rejects.toThrow('일일 게시 한도를 초과했습니다.');
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await assertion;
    // container 생성 1회 + publish 시도 1회 + 상태 확인 1회 = 3회 — 3회 재시도를 전부 태우지
    // 않았음을 증명(재시도했다면 최대 7회까지 호출됐을 것).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('IN_PROGRESS가 반복되어 최대 시도 횟수를 넘기면 타임아웃 에러를 던진다', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: 'container-1' })) // container 생성
      .mockResolvedValueOnce(jsonResponse({ error: { message: '아직 처리 중' } }, 400)) // 1차 publish 실패
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS', id: 'container-1' })) // 1차 상태 확인
      .mockResolvedValueOnce(jsonResponse({ error: { message: '아직 처리 중' } }, 400)) // 2차 publish 실패
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS', id: 'container-1' })) // 2차 상태 확인
      .mockResolvedValueOnce(jsonResponse({ error: { message: '아직 처리 중' } }, 400)) // 3차 publish 실패
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS', id: 'container-1' })); // 3차 상태 확인

    const promise = publishThreadsPost({ accessToken: 'token', threadsUserId: 'u1', text: '✨ 본문' });
    // reject 핸들러를 타이머 진행 전에 미리 붙여둔다 — 그렇지 않으면 3차 시도 직후(두 번째
    // advanceTimersByTimeAsync 안에서) promise가 먼저 reject되고 나중에 핸들러가 붙어
    // "unhandled rejection"으로 잡혀 테스트가 오탐 실패한다.
    const assertion = expect(promise).rejects.toThrow(
      'Threads 게시가 시간 내에 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.'
    );
    await vi.advanceTimersByTimeAsync(3_000); // 1차 시도 후 대기
    await vi.advanceTimersByTimeAsync(3_000); // 2차 시도 후 대기 (3차 시도 후에는 대기가 없다)
    await assertion;
    // container 생성 1회 + (publish 시도 + 상태 확인) × 3회 = 7회
    expect(fetchMock).toHaveBeenCalledTimes(7);
    vi.useRealTimers();
  });
});

describe('deleteThreadsPost', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('성공하면 삭제된 post id를 돌려준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, deleted_id: 'post-1' }));
    const result = await deleteThreadsPost({ accessToken: 'token', postId: 'post-1' });
    expect(result).toBe('post-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.threads.net/v1.0/post-1?access_token=token',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('실패하면 Threads의 error_message를 담아 ThreadsApiError를 던진다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: '이미 삭제된 게시물입니다.' } }, 400)
    );
    await expect(
      deleteThreadsPost({ accessToken: 'token', postId: 'post-1' })
    ).rejects.toThrow('이미 삭제된 게시물입니다.');
  });
});

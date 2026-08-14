import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/threads/account', () => ({ getThreadsAccount: vi.fn() }));
vi.mock('@/lib/profile/service', () => ({ ensureFreshThreadsToken: vi.fn() }));
// ThreadsApiError는 실제 클래스를 그대로 써야 라우트의 instanceof 분기가 의미 있게
// 검증된다 — 네트워크를 실제로 타는 publishThreadsPost/deleteThreadsPost만 목으로 바꾼다.
vi.mock('@/lib/threads/client', async () => {
  const actual = await vi.importActual('@/lib/threads/client');
  return {
    ...actual,
    publishThreadsPost: vi.fn(),
    deleteThreadsPost: vi.fn(),
    fetchThreadsPermalink: vi.fn(),
  };
});

function fakeAccount() {
  return {
    threadsUserId: 'u1',
    username: 'handle',
    accessToken: 'token',
    tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}

describe('POST /api/admin/threads/test-post', () => {
  beforeEach(() => vi.clearAllMocks());

  async function postTestPost(body: unknown) {
    const { POST } = await import('@/app/api/admin/threads/test-post/route');
    return POST(
      new Request('http://localhost/api/admin/threads/test-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  }

  it('text가 비어 있으면 400이고 아무 것도 호출하지 않는다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    const response = await postTestPost({ text: '   ' });
    expect(response.status).toBe(400);
    expect(getThreadsAccount).not.toHaveBeenCalled();
  });

  it('Threads 연결이 없으면 400', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const response = await postTestPost({ text: '테스트 글' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/연결/);
  });

  it('토큰이 만료됐으면 400', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAccount());
    const { ensureFreshThreadsToken } = await import('@/lib/profile/service');
    (ensureFreshThreadsToken as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('만료')
    );
    const response = await postTestPost({ text: '테스트 글' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/다시 연결/);
  });

  it('성공하면 post id를 돌려준다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAccount());
    const { ensureFreshThreadsToken } = await import('@/lib/profile/service');
    (ensureFreshThreadsToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'fresh-token'
    );
    const { publishThreadsPost } = await import('@/lib/threads/client');
    (publishThreadsPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('post-999');

    const response = await postTestPost({ text: '테스트 글' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.postId).toBe('post-999');
    expect(publishThreadsPost).toHaveBeenCalledWith({
      accessToken: 'fresh-token',
      threadsUserId: 'u1',
      text: '테스트 글',
    });
  });

  it('성공하면 permalink도 함께 돌려준다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAccount());
    const { ensureFreshThreadsToken } = await import('@/lib/profile/service');
    (ensureFreshThreadsToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'fresh-token'
    );
    const { publishThreadsPost, fetchThreadsPermalink } = await import('@/lib/threads/client');
    (publishThreadsPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('post-999');
    (fetchThreadsPermalink as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'https://www.threads.com/@handle/post/abc123'
    );

    const response = await postTestPost({ text: '테스트 글' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.permalink).toBe('https://www.threads.com/@handle/post/abc123');
    expect(fetchThreadsPermalink).toHaveBeenCalledWith({
      accessToken: 'fresh-token',
      postId: 'post-999',
    });
  });

  it('permalink 조회가 실패해도 게시 자체는 성공하고 permalink는 null로 온다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAccount());
    const { ensureFreshThreadsToken } = await import('@/lib/profile/service');
    (ensureFreshThreadsToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'fresh-token'
    );
    const { publishThreadsPost, fetchThreadsPermalink } = await import('@/lib/threads/client');
    (publishThreadsPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('post-999');
    (fetchThreadsPermalink as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('permalink 조회 실패')
    );

    const response = await postTestPost({ text: '테스트 글' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.postId).toBe('post-999');
    expect(body.permalink).toBeNull();
  });

  it('Threads가 게시를 거절하면 502이고 오류 메시지를 그대로 전달한다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAccount());
    const { ensureFreshThreadsToken } = await import('@/lib/profile/service');
    (ensureFreshThreadsToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'fresh-token'
    );
    const { publishThreadsPost, ThreadsApiError } = await import('@/lib/threads/client');
    (publishThreadsPost as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ThreadsApiError('일일 게시 한도를 초과했습니다.')
    );

    const response = await postTestPost({ text: '테스트 글' });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe('일일 게시 한도를 초과했습니다.');
  });
});

describe('DELETE /api/admin/threads/test-post/[postId]', () => {
  beforeEach(() => vi.clearAllMocks());

  async function deleteTestPost(postId: string) {
    const { DELETE } = await import('@/app/api/admin/threads/test-post/[postId]/route');
    return DELETE(new Request(`http://localhost/api/admin/threads/test-post/${postId}`, { method: 'DELETE' }), {
      params: Promise.resolve({ postId }),
    });
  }

  it('Threads 연결이 없으면 400', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const response = await deleteTestPost('post-999');
    expect(response.status).toBe(400);
  });

  it('성공하면 ok: true를 돌려준다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAccount());
    const { ensureFreshThreadsToken } = await import('@/lib/profile/service');
    (ensureFreshThreadsToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'fresh-token'
    );
    const { deleteThreadsPost } = await import('@/lib/threads/client');
    (deleteThreadsPost as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('post-999');

    const response = await deleteTestPost('post-999');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(deleteThreadsPost).toHaveBeenCalledWith({ accessToken: 'fresh-token', postId: 'post-999' });
  });

  it('Threads가 삭제를 거절하면 502이고 오류 메시지를 그대로 전달한다', async () => {
    const { getThreadsAccount } = await import('@/lib/threads/account');
    (getThreadsAccount as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(fakeAccount());
    const { ensureFreshThreadsToken } = await import('@/lib/profile/service');
    (ensureFreshThreadsToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      'fresh-token'
    );
    const { deleteThreadsPost, ThreadsApiError } = await import('@/lib/threads/client');
    (deleteThreadsPost as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ThreadsApiError('이미 삭제된 게시물입니다.')
    );

    const response = await deleteTestPost('post-999');
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe('이미 삭제된 게시물입니다.');
  });
});

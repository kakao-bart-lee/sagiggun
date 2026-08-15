import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publishToThreads, deletePhoto } from '@/lib/profile/service';
import { ThreadsApiError } from '@/lib/threads/client';
import type { Profile, Status } from '@prisma/client';
import type { ThreadsAccountInfo } from '@/lib/threads/account';

function fakeProfile(partial: Partial<Profile> & { id: string; status: Status }): Profile {
  return {
    seq: null,
    faceType: null,
    partnerFaceTypes: [],
    partnerHeightMin: null,
    partnerHeightMax: null,
    smoking: null,
    tattoo: null,
    drinking: null,
    sourceHandle: 'x',
    rawText: 'raw',
    gender: null,
    birthYear: null,
    region: null,
    heightCm: null,
    job: null,
    hobbies: [],
    appealPoints: [],
    idealType: [],
    partnerBirthYearMin: null,
    partnerBirthYearMax: null,
    partnerRegions: [],
    dealBreakers: [],
    draftBody: null,
    finalBody: '✨ 본문',
    publishedPostId: null,
    publishedPermalink: null,
    publishedAt: null,
    publishStartedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

function fakeAccount(partial: Partial<ThreadsAccountInfo> = {}): ThreadsAccountInfo {
  return {
    threadsUserId: 'u1',
    username: 'handle',
    accessToken: 'token',
    tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...partial,
  };
}

describe('publishToThreads', () => {
  it('APPROVED이면 게시하고 PUBLISHED로 올려 seq·postId를 남긴다', async () => {
    const releaseClaim = vi.fn(async () => {});
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => true,
      publishText: async () => 'post-123',
      commit: async () =>
        fakeProfile({
          id: 'p1',
          status: 'PUBLISHED',
          seq: 7,
          finalBody: '✨ 본문',
          publishedAt: new Date(),
          publishedPostId: 'post-123',
        }),
      releaseClaim,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.status).toBe('PUBLISHED');
      expect(result.profile.seq).toBe(7);
      expect(result.profile.publishedPostId).toBe('post-123');
    }
    expect(releaseClaim).not.toHaveBeenCalled();
  });

  it('permalink 조회에 성공하면 commit에 그대로 전달한다', async () => {
    const commit = vi.fn(async () =>
      fakeProfile({ id: 'p1', status: 'PUBLISHED', seq: 7, publishedPostId: 'post-123' })
    );
    await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => true,
      publishText: async () => 'post-123',
      fetchPermalink: async () => 'https://www.threads.com/@handle/post/abc123',
      commit,
    });
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({ publishedPermalink: 'https://www.threads.com/@handle/post/abc123' })
    );
  });

  it('permalink 조회가 실패해도 게시 자체는 성공하고, permalink는 null로 넘어간다', async () => {
    const commit = vi.fn(async () =>
      fakeProfile({ id: 'p1', status: 'PUBLISHED', seq: 7, publishedPostId: 'post-123' })
    );
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => true,
      publishText: async () => 'post-123',
      fetchPermalink: async () => {
        throw new Error('permalink 조회 실패');
      },
      commit,
    });
    expect(result.ok).toBe(true);
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ publishedPermalink: null }));
  });

  it('승인 전이면 400이고 Threads를 호출하지 않는다', async () => {
    const publishText = vi.fn();
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'DRAFTED', finalBody: '✨ 본문' }),
      publishText,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
    expect(publishText).not.toHaveBeenCalled();
  });

  it('없으면 404', async () => {
    const result = await publishToThreads('missing', { find: async () => null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it('Threads 연결이 없으면 400', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/연결/);
    }
  });

  it('토큰이 만료됐으면 400', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => {
        throw new Error('만료');
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/다시 연결/);
    }
  });

  it('Threads API 호출이 실패하면 502이고 오류 메시지를 그대로 전달한다', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => true,
      publishText: async () => {
        throw new ThreadsApiError('일일 게시 한도를 초과했습니다.');
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toBe('일일 게시 한도를 초과했습니다.');
    }
  });

  it('게시는 성공했지만 DB 반영이 쓰기 경쟁으로 실패하면 post id를 담아 409를 준다', async () => {
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => true,
      publishText: async () => 'post-999',
      commit: async () => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/post-999/);
    }
  });

  it('선점 실패면 409이고 Threads를 호출하지 않는다', async () => {
    const publishText = vi.fn();
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => false,
      publishText,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/진행 중/);
    }
    expect(publishText).not.toHaveBeenCalled();
  });

  it('게시 실패면 선점을 해제한다', async () => {
    const releaseClaim = vi.fn(async () => {});
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => true,
      publishText: async () => {
        throw new ThreadsApiError('일일 게시 한도를 초과했습니다.');
      },
      releaseClaim,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
    expect(releaseClaim).toHaveBeenCalledWith('p1');
  });

  it('Threads가 명시적으로 거절한 게 아닌 오류(타임아웃 등)면 선점을 풀지 않는다', async () => {
    // ThreadsApiError는 Threads가 "거절했다"는 확실한 신호라 글이 없다고 볼 수 있다.
    // 그 외(타임아웃·네트워크 오류)는 요청이 Threads에 실제로 닿았는지 알 수 없으므로,
    // 여기서 선점을 풀면 운영자가 재시도했을 때 이미 올라간 글이 중복 게시될 수 있다 —
    // 이번 선점 기능이 막으려던 바로 그 상황이라 선점을 유지해야 한다.
    const releaseClaim = vi.fn(async () => {});
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => true,
      publishText: async () => {
        throw new Error('요청 시간 초과');
      },
      releaseClaim,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(502);
    expect(releaseClaim).not.toHaveBeenCalled();
  });

  it('게시 성공 후 commit이 throw하면 409 + post id를 담고, 선점은 풀지 않는다', async () => {
    const releaseClaim = vi.fn(async () => {});
    const result = await publishToThreads('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      getAccount: async () => fakeAccount(),
      ensureFreshToken: async () => 'fresh-token',
      claim: async () => true,
      publishText: async () => 'post-777',
      commit: async () => {
        throw new Error('db down');
      },
      releaseClaim,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/post-777/);
    }
    expect(releaseClaim).not.toHaveBeenCalled();
  });

  it('staleBefore가 현재보다 5분 전으로 계산된다', async () => {
    const now = new Date('2026-08-14T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const claim = vi.fn(async () => true);
      await publishToThreads('p1', {
        find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
        getAccount: async () => fakeAccount(),
        ensureFreshToken: async () => 'fresh-token',
        claim,
        publishText: async () => 'post-123',
        commit: async () =>
          fakeProfile({
            id: 'p1',
            status: 'PUBLISHED',
            seq: 7,
            finalBody: '✨ 본문',
            publishedAt: new Date(),
            publishedPostId: 'post-123',
          }),
      });
      expect(claim).toHaveBeenCalledWith(
        expect.objectContaining({ staleBefore: new Date(now.getTime() - 5 * 60 * 1000) })
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('deletePhoto', () => {
  it('파일과 행을 지운다', async () => {
    const removeFile = vi.fn(async () => {});
    const deleteRow = vi.fn(async () => {});
    const result = await deletePhoto('ph1', {
      find: async () => ({ id: 'ph1', storageKey: 'p/a.jpg' }),
      removeFile,
      deleteRow,
    });
    expect(result).toEqual({ ok: true });
    expect(removeFile).toHaveBeenCalledWith('p/a.jpg');
    expect(deleteRow).toHaveBeenCalledWith('ph1');
  });

  it('없으면 404', async () => {
    const result = await deletePhoto('missing', { find: async () => null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it('파일 삭제 실패해도 행은 지운다', async () => {
    const deleteRow = vi.fn(async () => {});
    const result = await deletePhoto('ph1', {
      find: async () => ({ id: 'ph1', storageKey: 'p/a.jpg' }),
      removeFile: async () => {
        throw new Error('disk');
      },
      deleteRow,
    });
    expect(result).toEqual({ ok: true });
    expect(deleteRow).toHaveBeenCalledWith('ph1');
  });
});

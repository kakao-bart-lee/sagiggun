import { describe, it, expect, vi } from 'vitest';
import { markPublished, deletePhoto } from '@/lib/profile/service';
import type { Profile, Status } from '@prisma/client';

function fakeProfile(partial: Partial<Profile> & { id: string; status: Status }): Profile {
  return {
    seq: null,
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
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('markPublished', () => {
  it('APPROVED이면 PUBLISHED로 올리고 seq를 발급한다', async () => {
    const result = await markPublished('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      commit: async () =>
        fakeProfile({ id: 'p1', status: 'PUBLISHED', seq: 7, finalBody: '✨ 본문', publishedAt: new Date() }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.status).toBe('PUBLISHED');
      expect(result.profile.seq).toBe(7);
    }
  });

  it('승인 전이면 400', async () => {
    const result = await markPublished('p1', {
      find: async () => ({ id: 'p1', status: 'DRAFTED', finalBody: '✨ 본문' }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it('없으면 404', async () => {
    const result = await markPublished('missing', { find: async () => null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it('쓰기 경쟁으로 commit이 null이면 409', async () => {
    const result = await markPublished('p1', {
      find: async () => ({ id: 'p1', status: 'APPROVED', finalBody: '✨ 본문' }),
      commit: async () => null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
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

import { removePhoto } from '@/lib/storage';
import { canPublish } from '@/lib/profile/state';
import type { Profile, Status } from '@prisma/client';

// prisma는 함수 안에서 동적으로 불러온다 — 모듈 최상단에서 가져오면
// @/lib/prisma가 즉시 클라이언트를 만들며 getEnv()를 호출해, deleteProfile에
// 가짜 의존성을 모두 주입해도 테스트가 환경변수 부재로 깨진다.
export async function findDuplicates(
  sourceHandle: string
): Promise<Array<{ id: string; status: Status; createdAt: Date }>> {
  const { prisma } = await import('@/lib/prisma');
  return prisma.profile.findMany({
    where: { sourceHandle },
    select: { id: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export type DeleteDeps = {
  listKeys?: (id: string) => Promise<string[]>;
  removeFile?: (key: string) => Promise<void>;
  deleteRow?: (id: string) => Promise<void>;
};

// 행만 지우면 사진 파일이 고아로 남는다. 파일을 먼저 지우고 행을 지운다.
// 파일 삭제가 실패해도 행 삭제는 진행한다 — 남은 파일은 고아일 뿐이지만,
// 행이 남으면 사용자에게 지워지지 않은 것으로 보인다.
export async function deleteProfile(id: string, deps: DeleteDeps = {}): Promise<void> {
  const listKeys =
    deps.listKeys ??
    (async (profileId: string) => {
      const { prisma } = await import('@/lib/prisma');
      const photos = await prisma.photo.findMany({
        where: { profileId },
        select: { storageKey: true },
      });
      return photos.map((p) => p.storageKey);
    });
  const removeFile = deps.removeFile ?? removePhoto;
  const deleteRow =
    deps.deleteRow ??
    (async (profileId: string) => {
      const { prisma } = await import('@/lib/prisma');
      await prisma.profile.delete({ where: { id: profileId } });
    });

  for (const key of await listKeys(id)) {
    try {
      await removeFile(key);
    } catch (error) {
      console.warn('[profile] 사진 파일 삭제 실패', key, error);
    }
  }

  await deleteRow(id);
}

export type MarkPublishedResult =
  | { ok: true; profile: Profile }
  | { ok: false; status: 400 | 404 | 409; error: string };

export type MarkPublishedDeps = {
  find?: (id: string) => Promise<{ id: string; status: Status; finalBody: string | null } | null>;
  beforeWrite?: () => void | Promise<void>;
  commit?: (args: {
    id: string;
    expectedStatus: Status;
    expectedFinalBody: string | null;
  }) => Promise<Profile | null>;
};

/**
 * Threads API 없이 손으로 게시한 뒤 상태만 PUBLISHED로 올린다.
 * seq는 게시 시점에 발급한다(미리 발급하지 않음).
 */
export async function markPublished(
  id: string,
  deps: MarkPublishedDeps = {}
): Promise<MarkPublishedResult> {
  const find =
    deps.find ??
    (async (profileId: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.profile.findUnique({
        where: { id: profileId },
        select: { id: true, status: true, finalBody: true },
      });
    });

  const profile = await find(id);
  if (!profile) return { ok: false, status: 404, error: '없는 프로필입니다.' };

  const check = canPublish(profile);
  if (!check.ok) return { ok: false, status: 400, error: check.reason };

  await deps.beforeWrite?.();

  const commit =
    deps.commit ??
    (async ({ id: profileId, expectedStatus, expectedFinalBody }) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.$transaction(async (tx) => {
        const max = await tx.profile.aggregate({ _max: { seq: true } });
        const nextSeq = (max._max.seq ?? 0) + 1;
        const result = await tx.profile.updateMany({
          where: { id: profileId, status: expectedStatus, finalBody: expectedFinalBody },
          data: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            seq: nextSeq,
          },
        });
        if (result.count === 0) return null;
        return tx.profile.findUniqueOrThrow({ where: { id: profileId } });
      });
    });

  const updated = await commit({
    id,
    expectedStatus: profile.status,
    expectedFinalBody: profile.finalBody,
  });
  if (!updated) {
    return {
      ok: false,
      status: 409,
      error: '게시 표시하는 동안 프로필이 변경되었습니다. 새로고침 후 다시 시도해 주세요.',
    };
  }
  return { ok: true, profile: updated };
}

export type DeletePhotoDeps = {
  find?: (id: string) => Promise<{ id: string; storageKey: string } | null>;
  removeFile?: (key: string) => Promise<void>;
  deleteRow?: (id: string) => Promise<void>;
};

export async function deletePhoto(
  id: string,
  deps: DeletePhotoDeps = {}
): Promise<{ ok: true } | { ok: false; status: 404; error: string }> {
  const find =
    deps.find ??
    (async (photoId: string) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.photo.findUnique({
        where: { id: photoId },
        select: { id: true, storageKey: true },
      });
    });
  const removeFile = deps.removeFile ?? removePhoto;
  const deleteRow =
    deps.deleteRow ??
    (async (photoId: string) => {
      const { prisma } = await import('@/lib/prisma');
      await prisma.photo.delete({ where: { id: photoId } });
    });

  const photo = await find(id);
  if (!photo) return { ok: false, status: 404, error: '없는 사진입니다.' };

  try {
    await removeFile(photo.storageKey);
  } catch (error) {
    console.warn('[photo] 파일 삭제 실패', photo.storageKey, error);
  }
  await deleteRow(id);
  return { ok: true };
}

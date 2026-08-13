import { removePhoto } from '@/lib/storage';
import { canPublish } from '@/lib/profile/state';
import { getThreadsAccount, updateThreadsAccessToken } from '@/lib/threads/account';
import { refreshLongLivedToken, publishThreadsPost, ThreadsApiError } from '@/lib/threads/client';
import type { ThreadsAccountInfo } from '@/lib/threads/account';
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

export type PublishResult =
  | { ok: true; profile: Profile }
  | { ok: false; status: 400 | 404 | 409 | 502; error: string };

export type PublishDeps = {
  find?: (id: string) => Promise<{ id: string; status: Status; finalBody: string | null } | null>;
  getAccount?: () => Promise<ThreadsAccountInfo | null>;
  ensureFreshToken?: (account: ThreadsAccountInfo) => Promise<string>;
  publishText?: (args: { accessToken: string; threadsUserId: string; text: string }) => Promise<string>;
  beforeWrite?: () => void | Promise<void>;
  commit?: (args: {
    id: string;
    expectedStatus: Status;
    expectedFinalBody: string | null;
    publishedPostId: string;
  }) => Promise<Profile | null>;
};

// 만료 7일 이내면 미리 갱신한다. 갱신 자체가 실패해도(네트워크 등) 아직 만료 전이면 기존
// 토큰으로 계속 진행한다 — Threads 장기 토큰은 "만료 전"에만 갱신 가능하므로, 이미 만료된
// 경우에만 진짜 에러로 취급한다.
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function defaultEnsureFreshToken(account: ThreadsAccountInfo): Promise<string> {
  const now = Date.now();
  if (account.tokenExpiresAt.getTime() <= now) {
    throw new Error('Threads 토큰이 만료되었습니다.');
  }
  if (account.tokenExpiresAt.getTime() - now > REFRESH_WINDOW_MS) {
    return account.accessToken;
  }
  try {
    const refreshed = await refreshLongLivedToken({ accessToken: account.accessToken });
    const expiresAt = new Date(now + refreshed.expiresInSeconds * 1000);
    await updateThreadsAccessToken(refreshed.accessToken, expiresAt);
    return refreshed.accessToken;
  } catch (error) {
    console.warn('[threads] 토큰 갱신 실패, 기존 토큰으로 계속', error);
    return account.accessToken;
  }
}

/**
 * 승인된 프로필을 Threads Publishing API로 게시하고 그 결과를 기록한다.
 * seq는 게시 시점에 발급한다(미리 발급하지 않음).
 */
export async function publishToThreads(id: string, deps: PublishDeps = {}): Promise<PublishResult> {
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

  const getAccount = deps.getAccount ?? getThreadsAccount;
  const account = await getAccount();
  if (!account) {
    return { ok: false, status: 400, error: 'Threads 연결이 필요합니다. 설정에서 연결해 주세요.' };
  }

  const ensureFreshToken = deps.ensureFreshToken ?? defaultEnsureFreshToken;
  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(account);
  } catch {
    return { ok: false, status: 400, error: 'Threads 연결이 만료됐습니다. 설정에서 다시 연결해 주세요.' };
  }

  const publishText = deps.publishText ?? publishThreadsPost;
  let publishedPostId: string;
  try {
    publishedPostId = await publishText({
      accessToken,
      threadsUserId: account.threadsUserId,
      text: profile.finalBody ?? '',
    });
  } catch (error) {
    const message = error instanceof ThreadsApiError ? error.message : 'Threads 게시에 실패했습니다.';
    return { ok: false, status: 502, error: message };
  }

  await deps.beforeWrite?.();

  const commit =
    deps.commit ??
    (async ({ id: profileId, expectedStatus, expectedFinalBody, publishedPostId: postId }) => {
      const { prisma } = await import('@/lib/prisma');
      return prisma.$transaction(async (tx) => {
        const max = await tx.profile.aggregate({ _max: { seq: true } });
        const nextSeq = (max._max.seq ?? 0) + 1;
        const result = await tx.profile.updateMany({
          where: { id: profileId, status: expectedStatus, finalBody: expectedFinalBody },
          data: { status: 'PUBLISHED', publishedAt: new Date(), seq: nextSeq, publishedPostId: postId },
        });
        if (result.count === 0) return null;
        return tx.profile.findUniqueOrThrow({ where: { id: profileId } });
      });
    });

  const updated = await commit({
    id,
    expectedStatus: profile.status,
    expectedFinalBody: profile.finalBody,
    publishedPostId,
  });
  if (!updated) {
    console.error('[threads] 게시 성공 후 DB 반영 실패', { id, publishedPostId });
    return {
      ok: false,
      status: 409,
      error: `게시는 완료됐지만(Threads post id: ${publishedPostId}) 프로필이 그 사이 변경되어 상태를 반영하지 못했습니다. 직접 확인해 주세요.`,
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

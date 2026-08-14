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
  claim?: (args: {
    id: string;
    expectedStatus: Status;
    expectedFinalBody: string | null;
    staleBefore: Date;
  }) => Promise<boolean>;
  releaseClaim?: (id: string) => Promise<void>;
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

// 선점이 이보다 오래됐으면 죽은 프로세스가 남긴 것으로 보고 재선점을 허용한다.
// publishThreadsPost의 요청당 타임아웃(10초) × 최대 7회 + 재시도 대기(3초 × 2)로 살아 있는
// 요청의 상한이 약 90초라, 이 시간까지 버티는 요청은 존재할 수 없다(3배 이상 여유).
const PUBLISH_CLAIM_STALE_MS = 5 * 60 * 1000;

// export하는 이유: "테스트 게시"(설정 화면, 어떤 Profile과도 무관)도 실제 게시와 똑같은
// 토큰 갱신 판단이 필요하다. 두 번째 호출부가 생겨서야 뽑아냈다 — 그전까지는 이 파일 안의
// 유일한 사용처였다.
export async function ensureFreshThreadsToken(account: ThreadsAccountInfo): Promise<string> {
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

  const ensureFreshToken = deps.ensureFreshToken ?? ensureFreshThreadsToken;
  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(account);
  } catch {
    return { ok: false, status: 400, error: 'Threads 연결이 만료됐습니다. 설정에서 다시 연결해 주세요.' };
  }

  const claim =
    deps.claim ??
    (async ({ id: profileId, expectedStatus, expectedFinalBody, staleBefore }) => {
      const { prisma } = await import('@/lib/prisma');
      const result = await prisma.profile.updateMany({
        where: {
          id: profileId,
          status: expectedStatus,
          finalBody: expectedFinalBody,
          OR: [{ publishStartedAt: null }, { publishStartedAt: { lt: staleBefore } }],
        },
        data: { publishStartedAt: new Date() },
      });
      return result.count === 1;
    });

  const releaseClaim =
    deps.releaseClaim ??
    (async (profileId: string) => {
      const { prisma } = await import('@/lib/prisma');
      await prisma.profile.updateMany({
        where: { id: profileId },
        data: { publishStartedAt: null },
      });
    });

  const claimed = await claim({
    id,
    expectedStatus: profile.status,
    expectedFinalBody: profile.finalBody,
    staleBefore: new Date(Date.now() - PUBLISH_CLAIM_STALE_MS),
  });
  if (!claimed) {
    return {
      ok: false,
      status: 409,
      error: '이미 게시가 진행 중입니다. 잠시 후 새로고침해 결과를 확인해 주세요.',
    };
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
    // ThreadsApiError는 Threads가 명시적으로 거절했다는 신호라 글이 올라가지 않았다고 볼 수
    // 있다 — 이때만 선점을 풀어 바로 재시도할 수 있게 한다. 그 외(타임아웃·네트워크 오류 등)는
    // 요청이 Threads에 실제로 닿았는지 알 수 없으므로 선점을 유지한다. 여기서 풀어버리면
    // 운영자가 재시도했을 때 이미 올라간 글이 중복 게시될 수 있다 — 이 선점 기능 자체가
    // 막으려던 상황이다.
    if (error instanceof ThreadsApiError) {
      try {
        await releaseClaim(id);
      } catch (releaseError) {
        console.warn('[threads] 게시 실패 후 선점 해제 실패', releaseError);
      }
    } else {
      console.error('[threads] 게시 결과를 알 수 없어 선점을 유지합니다', { id, error });
    }
    const message = error instanceof ThreadsApiError ? error.message : 'Threads 게시에 실패했습니다.';
    return { ok: false, status: 502, error: message };
  }

  await deps.beforeWrite?.();

  const commit =
    deps.commit ??
    (async ({ id: profileId, expectedStatus, expectedFinalBody, publishedPostId: postId }) => {
      const { prisma } = await import('@/lib/prisma');
      // seq는 @unique인데 max+1로 뽑으므로 동시에 두 건이 게시되면 같은 값을 노려 P2002가 난다.
      // 이 시점에는 Threads에 이미 글이 올라간 뒤라 그냥 던지면 "게시됐는데 기록 없음"이 되므로,
      // 충돌만 짧게 재시도한다.
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await prisma.$transaction(async (tx) => {
            const max = await tx.profile.aggregate({ _max: { seq: true } });
            const nextSeq = (max._max.seq ?? 0) + 1;
            const result = await tx.profile.updateMany({
              where: { id: profileId, status: expectedStatus, finalBody: expectedFinalBody },
              data: {
                status: 'PUBLISHED',
                publishedAt: new Date(),
                seq: nextSeq,
                publishedPostId: postId,
                publishStartedAt: null,
              },
            });
            if (result.count === 0) return null;
            return tx.profile.findUniqueOrThrow({ where: { id: profileId } });
          });
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== 'P2002' || attempt >= 3) throw error;
        }
      }
    });

  let updated: Profile | null;
  try {
    updated = await commit({
      id,
      expectedStatus: profile.status,
      expectedFinalBody: profile.finalBody,
      publishedPostId,
    });
  } catch (error) {
    // Threads에는 이미 올라갔고 DB 반영만 실패했다. 선점을 일부러 풀지 않는다 — 바로 다시
    // 누르면 중복 게시가 되므로, 운영자가 Threads를 확인할 시간(PUBLISH_CLAIM_STALE_MS)을 둔다.
    console.error('[threads] 게시 성공 후 DB 반영 실패(예외)', { id, publishedPostId, error });
    return {
      ok: false,
      status: 409,
      error: `게시는 완료됐지만(Threads post id: ${publishedPostId}) DB 반영에 실패했습니다. Threads에서 확인한 뒤 처리해 주세요.`,
    };
  }
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

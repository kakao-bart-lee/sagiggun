import { removePhoto } from '@/lib/storage';
import type { Status } from '@prisma/client';

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

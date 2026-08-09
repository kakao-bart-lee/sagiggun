import Link from 'next/link';
import { prisma } from '@/lib/prisma';

const STATUS_LABEL: Record<string, string> = {
  COLLECTED: '수집됨',
  DRAFTED: '초안',
  APPROVED: '승인됨',
  PUBLISHED: '게시됨',
  ARCHIVED: '보관',
};

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const profiles = await prisma.profile.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
      seq: true,
      status: true,
      sourceHandle: true,
      region: true,
      birthYear: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">프로필 {profiles.length}건</h1>
        <Link href="/admin/new" className="rounded-lg bg-neutral-100 px-4 py-2 text-neutral-900">
          새로 입수
        </Link>
      </div>

      {profiles.length === 0 ? (
        <p className="text-neutral-500">아직 입수한 프로필이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/profiles/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900"
              >
                <span>
                  @{p.sourceHandle}
                  <span className="ml-2 text-neutral-500">
                    {p.region ?? '지역 미상'} · {p.birthYear ?? '연도 미상'}
                  </span>
                </span>
                <span className="text-sm text-neutral-400">
                  {p.seq ? `#${p.seq} · ` : ''}
                  {STATUS_LABEL[p.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

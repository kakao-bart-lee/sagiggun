import Link from 'next/link';
import { AccessionCard, AdminTopBar, SessionStrip, StampLink } from '@/components/admin-ui';
import { STATUS_LABEL, statusTone, cn } from '@/lib/ui';
import { prisma } from '@/lib/prisma';
import type { Prisma, Status } from '@prisma/client';

export const dynamic = 'force-dynamic';

type FilterKey = 'active' | 'approved' | 'published' | 'archived' | 'all';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'active', label: '진행 중' },
  { key: 'approved', label: '승인' },
  { key: 'published', label: '게시됨' },
  { key: 'archived', label: '보관' },
  { key: 'all', label: '전체' },
];

function whereFor(filter: FilterKey): Prisma.ProfileWhereInput {
  switch (filter) {
    case 'approved':
      return { status: 'APPROVED' };
    case 'published':
      return { status: 'PUBLISHED' };
    case 'archived':
      return { status: 'ARCHIVED' };
    case 'all':
      return {};
    case 'active':
    default:
      return { status: { not: 'ARCHIVED' } };
  }
}

function parseFilter(raw: string | string[] | undefined): FilterKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'approved' || v === 'published' || v === 'archived' || v === 'all') return v;
  return 'active';
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.status);
  const profiles = await prisma.profile.findMany({
    where: whereFor(filter),
    select: {
      id: true,
      seq: true,
      status: true,
      sourceHandle: true,
      region: true,
      birthYear: true,
      photos: {
        select: { id: true },
        orderBy: { order: 'asc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <AdminTopBar />

      <nav className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'active' ? '/admin' : `/admin?status=${f.key}`}
            className={cn(
              'rounded-[10px] border-2 px-3 py-1.5 text-sm font-bold',
              filter === f.key
                ? 'border-yellow text-yellow'
                : 'border-edge text-fog-muted hover:border-fog-muted hover:text-fog'
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <SessionStrip
        title="오늘 세션"
        subtitle={profiles.length ? `${profiles.length}건` : '해당 필터에 프로필이 없습니다'}
        action={<StampLink href="/admin/new">새 프로필</StampLink>}
      >
        {profiles.length === 0 ? (
          <div className="rounded-[12px] border-2 border-dashed border-edge px-6 py-10 text-sm text-fog-muted">
            「새 프로필」로 받은 자기소개글과 사진을 올리면 여기에 카드가 쌓입니다.
          </div>
        ) : (
          profiles.map((p, i) => (
            <AccessionCard
              key={p.id}
              href={`/admin/profiles/${p.id}`}
              index={p.seq ?? i + 1}
              handle={p.sourceHandle}
              meta={`${p.region ?? '지역 미상'} · ${p.birthYear ?? '연도 미상'}`}
              statusLabel={STATUS_LABEL[p.status as Status] ?? p.status}
              tone={statusTone(p.status)}
              thumbSrc={p.photos[0] ? `/api/photos/${p.photos[0].id}` : null}
            />
          ))
        )}
      </SessionStrip>

      <section className="rounded-[12px] border-2 border-dashed border-edge px-6 py-16 text-center">
        <p className="text-lg font-bold text-fog">카드를 골라 검수 책상을 여세요</p>
        <p className="mt-2 text-sm text-fog-muted">
          사진·원문은 왼쪽, 게시 문구와 승인은 오른쪽 — 스트립에서 다음 건으로 이어갑니다.
        </p>
      </section>
    </main>
  );
}

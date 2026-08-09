import { AccessionCard, AdminTopBar, SessionStrip, StampLink } from '@/components/admin-ui';
import { STATUS_LABEL, statusTone } from '@/lib/ui';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const profiles = await prisma.profile.findMany({
    where: { status: { not: 'ARCHIVED' } },
    select: {
      id: true,
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

      <SessionStrip
        title="오늘 세션"
        subtitle={profiles.length ? `대기 ${profiles.length}건` : '아직 프로필이 없습니다'}
        action={<StampLink href="/admin/new">새 프로필</StampLink>}
      >
        {profiles.length === 0 ? (
          <div className="rounded-[12px] border-2 border-dashed border-edge px-6 py-10 text-sm text-fog-muted">
            「새 프로필」로 DM 원문과 사진을 올리면 여기에 카드가 쌓입니다.
          </div>
        ) : (
          profiles.map((p, i) => (
            <AccessionCard
              key={p.id}
              href={`/admin/profiles/${p.id}`}
              index={i + 1}
              handle={p.sourceHandle}
              meta={`${p.region ?? '지역 미상'} · ${p.birthYear ?? '연도 미상'}`}
              statusLabel={STATUS_LABEL[p.status] ?? p.status}
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

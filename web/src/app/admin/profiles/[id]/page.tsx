import { notFound } from 'next/navigation';
import {
  AccessionCard,
  AdminTopBar,
  Panel,
  SessionStrip,
  StampLink,
  StatusSeal,
} from '@/components/admin-ui';
import { STATUS_LABEL, statusTone } from '@/lib/ui';
import { prisma } from '@/lib/prisma';
import { ProfileEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, strip] = await Promise.all([
    prisma.profile.findUnique({
      where: { id },
      include: { photos: { orderBy: { order: 'asc' } } },
    }),
    prisma.profile.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: {
        id: true,
        status: true,
        sourceHandle: true,
        region: true,
        birthYear: true,
        photos: { select: { id: true }, orderBy: { order: 'asc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  if (!profile) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <AdminTopBar right={<StampLink href="/admin/new">새 프로필</StampLink>} />

      <SessionStrip title="오늘 세션" subtitle="대기 중 · 카드를 바꿔 가며 검수">
        {strip.map((p, i) => (
          <AccessionCard
            key={p.id}
            href={`/admin/profiles/${p.id}`}
            index={i + 1}
            handle={p.sourceHandle}
            meta={`${p.region ?? '지역 미상'} · ${p.birthYear ?? '연도 미상'}`}
            statusLabel={STATUS_LABEL[p.status] ?? p.status}
            tone={statusTone(p.status)}
            selected={p.id === profile.id}
            thumbSrc={p.photos[0] ? `/api/photos/${p.photos[0].id}` : null}
          />
        ))}
      </SessionStrip>

      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-extrabold text-fog">@{profile.sourceHandle}</h2>
        <StatusSeal
          label={STATUS_LABEL[profile.status] ?? profile.status}
          tone={statusTone(profile.status)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <Panel>
            <h3 className="mb-3 text-sm font-bold text-muted-on-card">사진</h3>
            {profile.photos.length === 0 ? (
              <p className="text-sm text-muted-on-card">사진이 없습니다.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {profile.photos.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={`/api/photos/${photo.id}`}
                    alt=""
                    className="h-36 w-36 rounded-[8px] border-2 border-edge object-cover"
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel className="flex-1">
            <h3 className="mb-3 text-sm font-bold text-muted-on-card">DM 원문</h3>
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-on-card">
              {profile.rawText}
            </pre>
          </Panel>
        </section>

        <ProfileEditor
          profile={{
            id: profile.id,
            status: profile.status,
            gender: profile.gender,
            birthYear: profile.birthYear,
            region: profile.region,
            heightCm: profile.heightCm,
            job: profile.job,
            hobbies: profile.hobbies,
            appealPoints: profile.appealPoints,
            idealType: profile.idealType,
            partnerBirthYearMin: profile.partnerBirthYearMin,
            partnerBirthYearMax: profile.partnerBirthYearMax,
            partnerRegions: profile.partnerRegions,
            dealBreakers: profile.dealBreakers,
            draftBody: profile.draftBody,
            finalBody: profile.finalBody,
          }}
        />
      </div>
    </main>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AccessionCard,
  AdminTopBar,
  Panel,
  SessionStrip,
  StampLink,
  StatusSeal,
} from '@/components/admin-ui';
import { INQUIRY_STATUS_LABEL, STATUS_LABEL, inquiryStatusTone, statusTone } from '@/lib/ui';
import { prisma } from '@/lib/prisma';
import { ProfileEditor } from './editor';
import { ProfilePhotos } from './photos-panel';
import { MatchPanel } from './match-panel';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [profile, strip, inquiries] = await Promise.all([
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
    prisma.inquiry.findMany({
      where: { OR: [{ targetId: id }, { fromProfileId: id }] },
      include: {
        target: { select: { id: true, seq: true, sourceHandle: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
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
        {profile.seq != null && (
          <span className="text-sm font-bold text-fog-muted">#{profile.seq}</span>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <Panel>
            <ProfilePhotos
              profileId={profile.id}
              photos={profile.photos.map((p) => ({ id: p.id }))}
            />
          </Panel>

          <Panel className="flex-1">
            <h3 className="mb-3 text-sm font-bold text-muted-on-card">받은 자기소개글</h3>
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

      {inquiries.length > 0 && (
        <section className="mt-5 rounded-[12px] border-2 border-edge bg-card p-4 text-on-card">
          <h3 className="mb-3 text-sm font-bold text-muted-on-card">받은 관심</h3>
          <ul className="flex flex-col gap-2">
            {inquiries.map((inq) => (
              <li key={inq.id}>
                <Link
                  href={`/admin/inquiries/${inq.id}`}
                  className="flex flex-wrap items-center gap-2 rounded-[8px] border-2 border-edge bg-field px-3 py-2 text-sm hover:border-telop-blue"
                >
                  {inq.targetId === profile.id ? (
                    <>
                      <span className="font-bold text-telop-blue">@{inq.fromHandle}</span>
                      <span className="text-xs text-muted-on-card">님이 이 프로필에 관심</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-on-card">이 분이 보낸 관심 →</span>
                      <span className="font-bold text-telop-blue">
                        {inq.target.seq != null ? `#${inq.target.seq} ` : ''}@
                        {inq.target.sourceHandle}
                      </span>
                    </>
                  )}
                  <StatusSeal
                    label={INQUIRY_STATUS_LABEL[inq.status] ?? inq.status}
                    tone={inquiryStatusTone(inq.status)}
                    className="ml-auto h-8 min-w-8 text-[10px]"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-5">
        <MatchPanel profileId={profile.id} />
      </div>
    </main>
  );
}

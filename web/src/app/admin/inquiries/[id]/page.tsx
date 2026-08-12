import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminTopBar, Panel, StatusSeal } from '@/components/admin-ui';
import {
  DELIVERY_KIND_LABEL,
  INQUIRY_STATUS_LABEL,
  STATUS_LABEL,
  inquiryStatusTone,
  statusTone,
} from '@/lib/ui';
import { prisma } from '@/lib/prisma';
import {
  connectBody,
  declineBody,
  specForwardBody,
  specRequestBody,
} from '@/lib/inquiry/templates';
import { InquiryActions } from './inquiry-actions';

export const dynamic = 'force-dynamic';

const DELIVERY_STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  INSERTED: '삽입됨',
  DONE: '완료',
  CANCELLED: '취소',
};

export default async function InquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: {
      target: {
        select: { id: true, seq: true, sourceHandle: true, status: true, finalBody: true },
      },
      fromProfile: {
        select: {
          id: true,
          sourceHandle: true,
          status: true,
          gender: true,
          birthYear: true,
          heightCm: true,
          region: true,
          job: true,
          hobbies: true,
          appealPoints: true,
        },
      },
      deliveries: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!inquiry) notFound();

  // ATTACH_PROFILE 후보 — 관심자 핸들과 같은 핸들로 수집된 프로필들.
  const attachCandidates = inquiry.fromProfileId
    ? []
    : await prisma.profile.findMany({
        where: {
          sourceHandle: { equals: inquiry.fromHandle, mode: 'insensitive' },
          id: { not: inquiry.targetId },
        },
        select: { id: true, sourceHandle: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

  // 문안 프리필은 서버에서 계산해 내려준다 — 클라이언트는 수정·전송만 한다.
  const templates = {
    specRequest: specRequestBody(inquiry.target.seq),
    specForward: inquiry.fromProfile
      ? specForwardBody(inquiry.target.seq, inquiry.fromProfile)
      : specForwardBody(inquiry.target.seq, {
          gender: null,
          birthYear: null,
          heightCm: null,
          region: null,
          job: null,
          hobbies: [],
          appealPoints: [],
        }),
    connectForFrom: connectBody(inquiry.target.sourceHandle),
    connectForTarget: connectBody(inquiry.fromHandle),
    decline: declineBody(inquiry.target.seq),
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <AdminTopBar />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-extrabold text-fog">
          {inquiry.target.seq != null ? `#${inquiry.target.seq} ` : ''}@{inquiry.target.sourceHandle}
          <span className="mx-2 text-fog-muted">←</span>@{inquiry.fromHandle}
        </h2>
        <StatusSeal
          label={INQUIRY_STATUS_LABEL[inquiry.status] ?? inquiry.status}
          tone={inquiryStatusTone(inquiry.status)}
        />
        {inquiry.source === 'WEB' && (
          <span className="text-xs font-bold text-fog-muted">웹에서 접수됨</span>
        )}
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-2 text-sm font-bold text-muted-on-card">관심 대상 (게시된 분)</h3>
          <p className="mb-1 flex flex-wrap items-center gap-2 text-sm">
            <Link href={`/admin/profiles/${inquiry.target.id}`} className="font-bold text-telop-blue underline">
              {inquiry.target.seq != null ? `#${inquiry.target.seq} ` : ''}@{inquiry.target.sourceHandle}
            </Link>
            <StatusSeal
              label={STATUS_LABEL[inquiry.target.status] ?? inquiry.target.status}
              tone={statusTone(inquiry.target.status)}
              className="h-8 min-w-8 text-[10px]"
            />
          </p>
          {inquiry.target.finalBody && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-snug text-muted-on-card">
              {inquiry.target.finalBody}
            </pre>
          )}
        </Panel>

        <Panel>
          <h3 className="mb-2 text-sm font-bold text-muted-on-card">관심 보낸 분</h3>
          <p className="mb-1 text-sm font-bold">@{inquiry.fromHandle}</p>
          {inquiry.fromProfile ? (
            <p className="text-sm">
              연결된 프로필:{' '}
              <Link
                href={`/admin/profiles/${inquiry.fromProfile.id}`}
                className="font-bold text-telop-blue underline"
              >
                @{inquiry.fromProfile.sourceHandle}
              </Link>{' '}
              <span className="text-xs text-muted-on-card">
                ({STATUS_LABEL[inquiry.fromProfile.status] ?? inquiry.fromProfile.status})
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-on-card">
              아직 프로필이 연결되지 않았습니다. 스펙 답장이 오면 확장 「이 대화 수집」이 자동으로
              연결하거나, 아래에서 직접 연결하세요.
            </p>
          )}
          {inquiry.note && (
            <>
              <h4 className="mb-1 mt-3 text-xs font-bold text-muted-on-card">메모 / 받은 자기소개글</h4>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-on-card">
                {inquiry.note}
              </pre>
            </>
          )}
        </Panel>
      </div>

      <InquiryActions
        inquiry={{
          id: inquiry.id,
          status: inquiry.status,
          fromHandle: inquiry.fromHandle,
          targetHandle: inquiry.target.sourceHandle,
          hasFromProfile: !!inquiry.fromProfileId,
        }}
        attachCandidates={attachCandidates.map((p) => ({
          id: p.id,
          sourceHandle: p.sourceHandle,
          status: p.status,
          createdAt: p.createdAt.toISOString().slice(0, 10),
        }))}
        templates={templates}
      />

      <section className="mt-5">
        <h3 className="mb-3 text-sm font-bold text-fog-muted">이 건의 보낼 메시지</h3>
        {inquiry.deliveries.length === 0 ? (
          <p className="text-sm text-fog-muted">아직 전달 항목이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {inquiry.deliveries.map((d) => (
              <li key={d.id}>
                <Panel className="p-4">
                  <div className="mb-2 flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-bold">{DELIVERY_KIND_LABEL[d.kind] ?? d.kind}</span>
                    <span className="text-muted-on-card">→ @{d.toHandle}</span>
                    <span className="text-xs font-bold text-muted-on-card">
                      {DELIVERY_STATUS_KO[d.status] ?? d.status}
                    </span>
                  </div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-on-card">
                    {d.body}
                  </pre>
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

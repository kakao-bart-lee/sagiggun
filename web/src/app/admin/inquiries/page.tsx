import Link from 'next/link';
import { AdminTopBar, Panel, StatusSeal } from '@/components/admin-ui';
import { INQUIRY_STATUS_LABEL, cn, inquiryStatusTone } from '@/lib/ui';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { NewInquiryForm } from './new-inquiry-form';

export const dynamic = 'force-dynamic';

type FilterKey = 'open' | 'received' | 'waiting' | 'forwarded' | 'done' | 'all';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'open', label: '진행 중' },
  { key: 'received', label: '접수' },
  { key: 'waiting', label: '스펙 대기' },
  { key: 'forwarded', label: '전달됨' },
  { key: 'done', label: '종결' },
  { key: 'all', label: '전체' },
];

function whereFor(filter: FilterKey): Prisma.InquiryWhereInput {
  switch (filter) {
    case 'received':
      return { status: 'RECEIVED' };
    case 'waiting':
      return { status: { in: ['SPEC_REQUESTED', 'SPEC_RECEIVED'] } };
    case 'forwarded':
      return { status: 'FORWARDED' };
    case 'done':
      return { status: { in: ['ACCEPTED', 'DECLINED', 'CLOSED'] } };
    case 'all':
      return {};
    case 'open':
    default:
      return { status: { notIn: ['ACCEPTED', 'DECLINED', 'CLOSED'] } };
  }
}

function parseFilter(raw: string | string[] | undefined): FilterKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'received' || v === 'waiting' || v === 'forwarded' || v === 'done' || v === 'all') {
    return v;
  }
  return 'open';
}

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.f);

  const [inquiries, published] = await Promise.all([
    prisma.inquiry.findMany({
      where: whereFor(filter),
      include: {
        target: { select: { id: true, seq: true, sourceHandle: true } },
        fromProfile: { select: { id: true, sourceHandle: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    // 관심은 게시글을 보고 오는 것이므로, 실제로 게시돼 번호가 붙은 프로필만 고를 수 있게 한다.
    prisma.profile.findMany({
      where: { status: 'PUBLISHED', seq: { not: null } },
      select: { seq: true, sourceHandle: true, region: true, birthYear: true, gender: true },
      orderBy: { seq: 'desc' },
    }),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <AdminTopBar />

      <h2 className="mb-2 text-xl font-extrabold text-fog">받은 관심</h2>
      <p className="mb-6 text-sm text-fog-muted">
        게시글을 보고 온 「N번 맘에 들어요」를 접수하고, 스펙 문의 → 스펙 전달 → 성사까지
        진행합니다. 보내기는 언제나 확장/Threads에서 직접 누릅니다.
      </p>

      <Panel className="mb-6">
        <h3 className="mb-3 text-sm font-bold text-muted-on-card">새 관심 접수</h3>
        <NewInquiryForm
          posts={published.map((p) => ({
            seq: p.seq as number,
            handle: p.sourceHandle,
            region: p.region,
            birthYear: p.birthYear,
            gender: p.gender,
          }))}
        />
      </Panel>

      <nav className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === 'open' ? '/admin/inquiries' : `/admin/inquiries?f=${f.key}`}
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

      {inquiries.length === 0 ? (
        <div className="rounded-[12px] border-2 border-dashed border-edge px-6 py-10 text-sm text-fog-muted">
          해당 필터에 받은 관심이 없습니다. DM으로 「N번 맘에 들어요」가 오면 위에서 접수하거나,
          확장의 「관심 접수」를 쓰세요.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {inquiries.map((inq) => (
            <li key={inq.id}>
              <Link
                href={`/admin/inquiries/${inq.id}`}
                className="flex items-center justify-between gap-4 rounded-[12px] border-2 border-edge bg-card p-4 text-on-card hover:border-telop-blue"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-extrabold">
                      {inq.target.seq != null ? `#${inq.target.seq}` : '(미게시)'}
                    </span>
                    <span className="font-bold">@{inq.target.sourceHandle}</span>
                    <span className="text-xs text-muted-on-card">←</span>
                    <span className="font-bold text-telop-blue">@{inq.fromHandle}</span>
                    {inq.source === 'WEB' && (
                      <span className="text-[11px] font-bold text-muted-on-card">웹 접수</span>
                    )}
                  </div>
                  {inq.note && (
                    <p className="mt-1 truncate text-xs text-muted-on-card">{inq.note}</p>
                  )}
                </div>
                <StatusSeal
                  label={INQUIRY_STATUS_LABEL[inq.status] ?? inq.status}
                  tone={inquiryStatusTone(inq.status)}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

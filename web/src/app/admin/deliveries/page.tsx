import { AdminTopBar, Panel, StampLink } from '@/components/admin-ui';
import { DELIVERY_KIND_LABEL } from '@/lib/ui';
import { prisma } from '@/lib/prisma';
import { DeliveryActions } from './delivery-actions';

export const dynamic = 'force-dynamic';

const STATUS_KO: Record<string, string> = {
  PENDING: '대기',
  INSERTED: '삽입됨',
  DONE: '완료',
  CANCELLED: '취소',
};

export default async function DeliveriesPage() {
  const items = await prisma.deliveryItem.findMany({
    where: { status: { in: ['PENDING', 'INSERTED'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      toProfile: { select: { id: true, sourceHandle: true } },
      inquiry: { select: { id: true } },
    },
  });

  const pendingCount = await prisma.deliveryItem.count({ where: { status: 'PENDING' } });

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <AdminTopBar right={<StampLink href="/admin/new">새 프로필</StampLink>} />

      <h2 className="mb-2 text-xl font-extrabold text-fog">전달 큐</h2>
      <p className="mb-2 text-sm text-fog-muted">
        대기 {pendingCount}건. 확장에서 문구를 넣은 뒤 운영자가 Threads에서 보냅니다 (자동 전송
        없음).
      </p>
      <p className="mb-6 text-xs text-fog-muted">
        확장 연동: `.env`의 `OPS_API_TOKEN`(16자+)과 관리자 URL을 확장 옵션에 저장하세요. 토큰 값은
        이 화면에 표시하지 않습니다.
      </p>

      {items.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted-on-card">열린 전달 항목이 없습니다.</p>
        </Panel>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id}>
              <Panel>
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  {item.toProfileId ? (
                    <a
                      href={`/admin/profiles/${item.toProfileId}`}
                      className="font-bold text-telop-blue underline"
                    >
                      @{item.toHandle}
                    </a>
                  ) : (
                    <span className="font-bold text-on-card">@{item.toHandle}</span>
                  )}
                  <span className="rounded-full border border-edge px-2 py-0.5 text-[11px] font-bold text-muted-on-card">
                    {DELIVERY_KIND_LABEL[item.kind] ?? item.kind}
                  </span>
                  {item.inquiry && (
                    <a
                      href={`/admin/inquiries/${item.inquiry.id}`}
                      className="text-xs font-bold text-telop-blue underline"
                    >
                      문의 보기
                    </a>
                  )}
                  <span className="text-xs font-bold text-muted-on-card">
                    {STATUS_KO[item.status] ?? item.status}
                  </span>
                </div>
                <pre className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap text-sm text-on-card">
                  {item.body}
                </pre>
                <DeliveryActions id={item.id} status={item.status} />
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

'use client';

import { StampButton } from '@/components/admin-ui';
import { STATUS_LABEL } from '@/lib/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type AttachCandidate = {
  id: string;
  sourceHandle: string;
  status: string;
  createdAt: string;
};

type Templates = {
  specRequest: string;
  specForward: string;
  connectForFrom: string;
  connectForTarget: string;
  decline: string;
};

type InquirySummary = {
  id: string;
  status: string;
  fromHandle: string;
  targetHandle: string;
  hasFromProfile: boolean;
};

const areaClass =
  'w-full rounded-[8px] border-2 border-edge bg-field p-2 text-xs leading-snug text-on-card';

export function InquiryActions({
  inquiry,
  attachCandidates,
  templates,
}: {
  inquiry: InquirySummary;
  attachCandidates: AttachCandidate[];
  templates: Templates;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const [specRequest, setSpecRequest] = useState(templates.specRequest);
  const [specForward, setSpecForward] = useState(templates.specForward);
  const [connectForFrom, setConnectForFrom] = useState(templates.connectForFrom);
  const [connectForTarget, setConnectForTarget] = useState(templates.connectForTarget);
  const [decline, setDecline] = useState(templates.decline);
  const [attachId, setAttachId] = useState('');

  async function act(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    setMessage('');
    const res = await fetch(`/api/inquiries/${inquiry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) {
      setMessage(data.error ?? '처리에 실패했습니다.');
      return;
    }
    const queued = data.deliveryIds?.length ?? 0;
    setMessage(queued ? `보낼 메시지에 ${queued}건을 담았습니다.` : '처리했습니다.');
    router.refresh();
  }

  const { status } = inquiry;
  const isTerminal = status === 'ACCEPTED' || status === 'DECLINED' || status === 'CLOSED';

  return (
    <section className="rounded-[12px] border-2 border-edge bg-card p-4 text-on-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-muted-on-card">다음 단계</h3>
        {message && <p className="text-sm font-bold text-muted-on-card">{message}</p>}
      </div>

      {isTerminal && (
        <p className="text-sm text-muted-on-card">종결된 문의입니다. 더 할 일이 없습니다.</p>
      )}

      {status === 'RECEIVED' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-muted-on-card">
            ① 관심 보낸 @{inquiry.fromHandle}에게 스펙 문의를 보냅니다. 문안을 다듬어 「보낼 메시지」에 담으세요.
          </p>
          <textarea
            value={specRequest}
            onChange={(e) => setSpecRequest(e.target.value)}
            rows={10}
            className={areaClass}
          />
          <div>
            <StampButton
              tone="yellow"
              className="min-h-10 px-4 py-2 text-sm"
              disabled={!!busy}
              onClick={() => void act({ action: 'REQUEST_SPEC', body: specRequest }, 'request')}
            >
              {busy === 'request' ? '담는 중…' : '스펙 문의 → 보낼 메시지'}
            </StampButton>
          </div>
        </div>
      )}

      {(status === 'RECEIVED' || status === 'SPEC_REQUESTED') && !inquiry.hasFromProfile && (
        <div className="mt-4 flex flex-col gap-2 border-t-2 border-edge pt-4">
          <p className="text-xs font-bold text-muted-on-card">
            ② 스펙 답장이 오면 프로필로 수집해 연결합니다. 확장 「이 대화 수집」이 자동 연결하고,
            직접 연결할 수도 있습니다.
          </p>
          {attachCandidates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachCandidates.map((c) => (
                <StampButton
                  key={c.id}
                  tone="blue"
                  className="min-h-9 px-3 py-1.5 text-xs"
                  disabled={!!busy}
                  onClick={() =>
                    void act({ action: 'ATTACH_PROFILE', fromProfileId: c.id }, 'attach' + c.id)
                  }
                >
                  @{c.sourceHandle} · {STATUS_LABEL[c.status] ?? c.status} · {c.createdAt} 연결
                </StampButton>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={attachId}
              onChange={(e) => setAttachId(e.target.value)}
              placeholder="프로필 ID로 직접 연결"
              className="min-w-64 rounded-[8px] border-2 border-edge bg-field p-2 text-xs text-on-card"
            />
            <StampButton
              tone="ghost"
              className="min-h-9 px-3 py-1.5 text-xs"
              disabled={!!busy || !attachId.trim()}
              onClick={() =>
                void act({ action: 'ATTACH_PROFILE', fromProfileId: attachId.trim() }, 'attach')
              }
            >
              연결
            </StampButton>
          </div>
        </div>
      )}

      {status === 'SPEC_RECEIVED' && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold text-muted-on-card">
            ③ 후보 @{inquiry.targetHandle}에게 관심자 스펙을 전달하고 만날 의향을 묻습니다. 사진은
            Threads에서 직접 이어 보내세요.
          </p>
          <textarea
            value={specForward}
            onChange={(e) => setSpecForward(e.target.value)}
            rows={12}
            className={areaClass}
          />
          <div>
            <StampButton
              tone="yellow"
              className="min-h-10 px-4 py-2 text-sm"
              disabled={!!busy}
              onClick={() => void act({ action: 'FORWARD', body: specForward }, 'forward')}
            >
              {busy === 'forward' ? '담는 중…' : '스펙 전달 → 보낼 메시지'}
            </StampButton>
          </div>
        </div>
      )}

      {status === 'FORWARDED' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-muted-on-card">
              ④ 후보가 OK하면 성사 — 양쪽에 서로의 스레드 아이디를 안내하는 문안 2건이 「보낼 메시지」에 담깁니다.
            </p>
            <label className="text-[11px] font-bold text-muted-on-card">
              → 관심 보낸 @{inquiry.fromHandle}에게
            </label>
            <textarea
              value={connectForFrom}
              onChange={(e) => setConnectForFrom(e.target.value)}
              rows={4}
              className={areaClass}
            />
            <label className="text-[11px] font-bold text-muted-on-card">
              → 후보 @{inquiry.targetHandle}에게
            </label>
            <textarea
              value={connectForTarget}
              onChange={(e) => setConnectForTarget(e.target.value)}
              rows={4}
              className={areaClass}
            />
            <div>
              <StampButton
                tone="yellow"
                className="min-h-10 px-4 py-2 text-sm"
                disabled={!!busy}
                onClick={() =>
                  void act(
                    {
                      action: 'ACCEPT',
                      bodyForFrom: connectForFrom,
                      bodyForTarget: connectForTarget,
                    },
                    'accept'
                  )
                }
              >
                {busy === 'accept' ? '처리 중…' : '성사 → 안내 2건 담기'}
              </StampButton>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t-2 border-edge pt-4">
            <p className="text-xs font-bold text-muted-on-card">
              후보가 거절하면 — 관심 보낸 분에게 보낼 안내 문안입니다.
            </p>
            <textarea
              value={decline}
              onChange={(e) => setDecline(e.target.value)}
              rows={4}
              className={areaClass}
            />
            <div>
              <StampButton
                tone="red"
                className="min-h-10 px-4 py-2 text-sm"
                disabled={!!busy}
                onClick={() => void act({ action: 'DECLINE', body: decline }, 'decline')}
              >
                {busy === 'decline' ? '처리 중…' : '거절 → 안내 담기'}
              </StampButton>
            </div>
          </div>
        </div>
      )}

      {!isTerminal && (
        <div className="mt-4 border-t-2 border-edge pt-4">
          <StampButton
            tone="ghost"
            className="min-h-9 px-3 py-1.5 text-xs"
            disabled={!!busy}
            onClick={() => {
              if (!confirm('이 문의를 종료할까요? (무응답·중단 등)')) return;
              void act({ action: 'CLOSE' }, 'close');
            }}
          >
            문의 종료
          </StampButton>
        </div>
      )}
    </section>
  );
}

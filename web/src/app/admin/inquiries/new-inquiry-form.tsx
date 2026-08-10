'use client';

import { StampButton } from '@/components/admin-ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const fieldClass = 'rounded-[8px] border-2 border-edge bg-field p-2 text-sm text-on-card';

export function NewInquiryForm() {
  const router = useRouter();
  const [seq, setSeq] = useState('');
  const [fromHandle, setFromHandle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const seqNum = Number(seq.trim());
    if (!Number.isInteger(seqNum) || seqNum <= 0) {
      setMessage('게시 번호를 확인해 주세요.');
      return;
    }
    if (!fromHandle.trim()) {
      setMessage('관심 보낸 분의 핸들을 입력하세요.');
      return;
    }
    setBusy(true);
    setMessage('');
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSeq: seqNum,
        fromHandle,
        note: note.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage(data.error ?? '접수에 실패했습니다.');
      return;
    }
    setSeq('');
    setFromHandle('');
    setNote('');
    setMessage(data.reused ? '이미 진행 중인 문의가 있어 그 건으로 이동합니다.' : '접수했습니다.');
    if (data.inquiry?.id) router.push(`/admin/inquiries/${data.inquiry.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted-on-card">게시 번호</span>
          <input
            value={seq}
            onChange={(e) => setSeq(e.target.value)}
            className={fieldClass}
            inputMode="numeric"
            placeholder="67"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted-on-card">관심 보낸 핸들</span>
          <input
            value={fromHandle}
            onChange={(e) => setFromHandle(e.target.value)}
            className={fieldClass}
            placeholder="@someone"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted-on-card">메모 (DM 원문 등, 선택)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className={fieldClass}
          placeholder="67번 맘에 들어요~"
        />
      </label>
      <div className="flex items-center gap-3">
        <StampButton tone="yellow" type="submit" disabled={busy} className="min-h-10 px-4 py-2 text-sm">
          {busy ? '접수 중…' : '접수'}
        </StampButton>
        {message && <p className="text-sm font-bold text-muted-on-card">{message}</p>}
      </div>
    </form>
  );
}

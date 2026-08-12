'use client';

import { StampButton } from '@/components/admin-ui';
import { withAtPrefix } from '@/lib/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const fieldClass = 'rounded-[8px] border-2 border-edge bg-field p-2 text-sm text-on-card';

/** 고를 수 있는 게시물 — 게시돼 번호가 붙은 프로필만 넘어온다. */
export type InquiryTargetPost = {
  seq: number;
  handle: string;
  region: string | null;
  birthYear: number | null;
  gender: string | null;
};

function describePost(p: InquiryTargetPost): string {
  const genderKo = p.gender === 'F' ? '여성' : p.gender === 'M' ? '남성' : '';
  return [p.region ?? '지역 미상', p.birthYear ? `${p.birthYear}년생` : '연도 미상', genderKo]
    .filter(Boolean)
    .join(' · ');
}

export function NewInquiryForm({ posts }: { posts: InquiryTargetPost[] }) {
  const router = useRouter();
  const [seq, setSeq] = useState('');
  const [fromHandle, setFromHandle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const selectedPost = posts.find((p) => String(p.seq) === seq);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const seqNum = Number(seq.trim());
    if (!Number.isInteger(seqNum) || seqNum <= 0) {
      setMessage('어떤 게시물인지 골라 주세요.');
      return;
    }
    if (!fromHandle.trim()) {
      setMessage('관심 보낸 분의 스레드 아이디를 입력하세요.');
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
          <select value={seq} onChange={(e) => setSeq(e.target.value)} className={fieldClass}>
            <option value="">게시물 선택</option>
            {posts.map((p) => (
              <option key={p.seq} value={String(p.seq)}>
                #{p.seq} @{p.handle} · {describePost(p)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-muted-on-card">관심 보낸 스레드 아이디</span>
          <input
            value={fromHandle}
            onChange={(e) => setFromHandle(withAtPrefix(e.target.value))}
            className={fieldClass}
            placeholder="@someone"
          />
        </label>
      </div>

      {posts.length === 0 ? (
        <p className="text-xs font-bold text-telop-red">
          게시된 프로필이 없어서 접수할 대상이 없습니다. 먼저 프로필을 승인·게시해 주세요.
        </p>
      ) : (
        selectedPost && (
          <p className="text-xs text-muted-on-card">
            선택한 게시물 — <span className="font-bold">#{selectedPost.seq}</span> @
            {selectedPost.handle} · {describePost(selectedPost)}
          </p>
        )
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted-on-card">메모 (받은 자기소개글 등, 선택)</span>
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

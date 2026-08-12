'use client';

import { useState } from 'react';

const fieldClass = 'rounded-[8px] border-2 border-edge bg-field p-3 text-sm text-on-card';

export function InterestForm({ targetSeq }: { targetSeq: number }) {
  const [handle, setHandle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!handle.trim()) {
      setError('스레드 아이디를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    const res = await fetch('/api/public/interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetSeq,
        fromHandle: handle,
        message: message.trim() || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? '접수에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-[8px] border-2 border-edge bg-field p-4 text-sm font-bold text-on-card">
        관심을 접수했어요! 주인장이 스레드 DM으로 연락드릴게요 💗
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted-on-card">내 스레드 아이디 (필수)</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className={fieldClass}
          placeholder="@my_threads"
          maxLength={60}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-muted-on-card">하고 싶은 말 (선택)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className={fieldClass}
          maxLength={2000}
          placeholder="간단한 자기소개나 궁금한 점을 남겨주세요"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center rounded-[10px] border-2 border-yellow bg-ink-elevated px-5 py-3 text-[15px] font-bold text-yellow shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--yellow)] hover:bg-yellow hover:text-ink disabled:opacity-40"
        >
          {busy ? '접수 중…' : '관심 보내기'}
        </button>
        {error && <p className="text-sm font-bold text-telop-red">{error}</p>}
      </div>
    </form>
  );
}

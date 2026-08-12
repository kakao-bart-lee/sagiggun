'use client';

import { StampButton } from '@/components/admin-ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

type Candidate = {
  id: string;
  sourceHandle: string;
  status: string;
  region: string | null;
  birthYear: number | null;
  gender: string | null;
};

type Suggestion = {
  id: string;
  rank: number;
  score: number | null;
  rationale: string;
  draftForSubject: string;
  draftForCandidate: string;
  status: string;
  candidate: Candidate;
};

type MatchRun = {
  id: string;
  createdAt: string;
  suggestions: Suggestion[];
};

export function MatchPanel({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [run, setRun] = useState<MatchRun | null>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/profiles/${profileId}/match`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRun(data.run ?? null);
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runMatch() {
    setBusy('match');
    setMessage('');
    const res = await fetch(`/api/profiles/${profileId}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topN: 5 }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) {
      setMessage(data.error ?? '매칭에 실패했습니다.');
      return;
    }
    setMessage(`추천 ${data.suggestions?.length ?? 0}건 (필터 통과 ${data.filteredCount})`);
    await load();
    router.refresh();
  }

  async function act(suggestionId: string, action: 'ACCEPT' | 'DISMISS') {
    setBusy(suggestionId + action);
    setMessage('');
    const res = await fetch(`/api/matches/suggestions/${suggestionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy('');
    if (!res.ok) {
      setMessage(data.error ?? '처리에 실패했습니다.');
      return;
    }
    if (action === 'ACCEPT') setMessage('보낼 메시지에 2건을 담았습니다.');
    await load();
    router.refresh();
  }

  return (
    <section className="rounded-[12px] border-2 border-edge bg-card p-4 text-on-card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-muted-on-card">매칭 추천 (1→N)</h3>
        <StampButton
          tone="blue"
          disabled={!!busy}
          onClick={() => void runMatch()}
          className="min-h-10 px-4 py-2 text-sm"
        >
          {busy === 'match' ? '추천 중…' : '매칭 추천 생성'}
        </StampButton>
      </div>
      {message && <p className="mb-3 text-sm text-muted-on-card">{message}</p>}
      {!run ? (
        <p className="text-sm text-muted-on-card">아직 추천이 없습니다. APPROVED/PUBLISHED 풀에서 고릅니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {run.suggestions.map((s) => (
            <li
              key={s.id}
              className="rounded-[10px] border-2 border-edge bg-field p-3 text-sm text-on-card"
            >
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="font-extrabold">#{s.rank}</span>
                <a className="font-bold text-telop-blue underline" href={`/admin/profiles/${s.candidate.id}`}>
                  @{s.candidate.sourceHandle}
                </a>
                <span className="text-xs text-muted-on-card">
                  {s.candidate.region ?? '지역 미상'} · {s.candidate.birthYear ?? '연도 미상'}
                  {s.score != null ? ` · score ${(s.score * 100).toFixed(0)}%` : ''}
                </span>
                <span className="text-xs font-bold text-muted-on-card">{s.status}</span>
              </div>
              <p className="mb-2 text-muted-on-card">{s.rationale}</p>
              <details className="mb-2">
                <summary className="cursor-pointer text-xs font-bold text-muted-on-card">전달 초안</summary>
                <pre className="mt-1 whitespace-pre-wrap text-xs">{s.draftForSubject}</pre>
                <hr className="my-2 border-edge" />
                <pre className="whitespace-pre-wrap text-xs">{s.draftForCandidate}</pre>
              </details>
              {s.status === 'PENDING' && (
                <div className="flex flex-wrap gap-2">
                  <StampButton
                    tone="yellow"
                    className="min-h-9 px-3 py-1.5 text-xs"
                    disabled={!!busy}
                    onClick={() => void act(s.id, 'ACCEPT')}
                  >
                    수락 → 메시지 담기
                  </StampButton>
                  <StampButton
                    tone="ghost"
                    className="min-h-9 px-3 py-1.5 text-xs"
                    disabled={!!busy}
                    onClick={() => void act(s.id, 'DISMISS')}
                  >
                    거절
                  </StampButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

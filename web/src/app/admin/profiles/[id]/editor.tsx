'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Profile = {
  id: string;
  status: string;
  gender: string | null;
  birthYear: number | null;
  region: string | null;
  heightCm: number | null;
  job: string | null;
  hobbies: string[];
  appealPoints: string[];
  idealType: string[];
  partnerBirthYearMin: number | null;
  partnerBirthYearMax: number | null;
  partnerRegions: string[];
  dealBreakers: string[];
  draftBody: string | null;
  finalBody: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  COLLECTED: '수집됨',
  DRAFTED: '초안',
  APPROVED: '승인됨',
  PUBLISHED: '게시됨',
  ARCHIVED: '보관',
};

export function ProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [body, setBody] = useState(profile.finalBody ?? '');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function call(path: string, init?: RequestInit, label = '') {
    setBusy(label);
    setMessage('');
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (!response.ok) {
      setMessage(data.error ?? '요청에 실패했습니다.');
      return null;
    }
    router.refresh();
    return data;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-neutral-700 px-3 py-1 text-sm">
          {STATUS_LABEL[profile.status]}
        </span>
        <button
          onClick={() => call(`/api/profiles/${profile.id}/extract`, { method: 'POST' }, 'extract')}
          disabled={!!busy}
          className="rounded-lg border border-neutral-700 px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy === 'extract' ? '추출 중…' : '추출 실행'}
        </button>
        <button
          onClick={async () => {
            const result = await call(`/api/profiles/${profile.id}/compose`, { method: 'POST' }, 'compose');
            // call()의 router.refresh()는 이 서버 컴포넌트 트리를 다시 그리지만
            // ProfileEditor는 리마운트되지 않으므로 useState(profile.finalBody ?? '')
            // 초기값은 다시 평가되지 않는다 — 그대로 두면 작문이 성공해도 텍스트
            // 영역이 갱신되지 않는다. 응답의 finalBody로 로컬 상태를 직접 맞춘다.
            if (result?.profile?.finalBody != null) setBody(result.profile.finalBody);
          }}
          disabled={!!busy}
          className="rounded-lg border border-neutral-700 px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy === 'compose' ? '작문 중…' : '문구 작성'}
        </button>
      </div>

      <details className="rounded-lg border border-neutral-800 p-4">
        <summary className="cursor-pointer text-sm text-neutral-400">추출된 항목</summary>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-neutral-500">지역</dt>
          <dd>{profile.region ?? '—'}</dd>
          <dt className="text-neutral-500">출생연도</dt>
          <dd>{profile.birthYear ?? '—'}</dd>
          <dt className="text-neutral-500">키</dt>
          <dd>{profile.heightCm ? `${profile.heightCm}cm` : '—'}</dd>
          <dt className="text-neutral-500">직업</dt>
          <dd>{profile.job ?? '—'}</dd>
          <dt className="text-neutral-500">취미</dt>
          <dd>{profile.hobbies.join(', ') || '—'}</dd>
          <dt className="text-neutral-500">이상형 나이</dt>
          <dd>
            {profile.partnerBirthYearMin && profile.partnerBirthYearMax
              ? `${profile.partnerBirthYearMin}~${profile.partnerBirthYearMax}년생`
              : '—'}
          </dd>
        </dl>
      </details>

      <label className="flex flex-col gap-1">
        <span className="text-sm text-neutral-400">게시 문구 (번호 없이 ✨로 시작)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={20}
          className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <button
          onClick={() =>
            call(
              `/api/profiles/${profile.id}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ finalBody: body }),
              },
              'save'
            )
          }
          disabled={!!busy}
          className="rounded-lg border border-neutral-700 px-4 py-2 disabled:opacity-50"
        >
          {busy === 'save' ? '저장 중…' : '문구 저장'}
        </button>

        <button
          onClick={async () => {
            const saved = await call(
              `/api/profiles/${profile.id}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ finalBody: body }),
              },
              'approve'
            );
            if (saved) await call(`/api/profiles/${profile.id}/approve`, { method: 'POST' }, 'approve');
          }}
          disabled={!!busy}
          className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 disabled:opacity-50"
        >
          {busy === 'approve' ? '승인 중…' : '저장하고 승인'}
        </button>

        <button
          onClick={async () => {
            if (!confirm('이 프로필과 사진을 모두 삭제할까요?')) return;
            const done = await call(`/api/profiles/${profile.id}`, { method: 'DELETE' }, 'delete');
            if (done) router.push('/admin');
          }}
          disabled={!!busy}
          className="ml-auto rounded-lg border border-red-900 px-4 py-2 text-red-400 disabled:opacity-50"
        >
          삭제
        </button>
      </div>

      {message && <p className="text-sm text-amber-400">{message}</p>}
    </section>
  );
}

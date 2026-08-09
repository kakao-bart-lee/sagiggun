'use client';

import { StampButton, StatusSeal } from '@/components/admin-ui';
import { STATUS_LABEL, statusTone } from '@/lib/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

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

export function ProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [body, setBody] = useState(profile.finalBody ?? '');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const deleting = useRef(false);

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
      <div className="flex flex-wrap items-center gap-2">
        <StatusSeal
          label={STATUS_LABEL[profile.status] ?? profile.status}
          tone={statusTone(profile.status)}
        />
        <StampButton
          tone="ghost"
          onClick={() => call(`/api/profiles/${profile.id}/extract`, { method: 'POST' }, 'extract')}
          disabled={!!busy}
          className="min-h-10 px-3 py-2 text-sm"
        >
          {busy === 'extract' ? '추출 중…' : '추출 실행'}
        </StampButton>
        <StampButton
          tone="blue"
          className="min-h-10 px-3 py-2 text-sm"
          disabled={!!busy}
          onClick={async () => {
            if (dirty && !confirm('작성 중인 내용이 있습니다. 새 초안으로 덮어쓸까요?')) return;
            const result = await call(
              `/api/profiles/${profile.id}/compose`,
              { method: 'POST' },
              'compose'
            );
            if (result?.profile?.draftBody != null) {
              setBody(result.profile.draftBody);
              setDirty(true);
            }
          }}
        >
          {busy === 'compose' ? '작문 중…' : '문구 작성'}
        </StampButton>
      </div>

      <details className="rounded-[12px] border-2 border-edge bg-card p-4 text-on-card">
        <summary className="cursor-pointer text-sm font-bold text-muted-on-card">추출된 항목</summary>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-on-card">지역</dt>
          <dd>{profile.region ?? '—'}</dd>
          <dt className="text-muted-on-card">출생연도</dt>
          <dd>{profile.birthYear ?? '—'}</dd>
          <dt className="text-muted-on-card">키</dt>
          <dd>{profile.heightCm ? `${profile.heightCm}cm` : '—'}</dd>
          <dt className="text-muted-on-card">직업</dt>
          <dd>{profile.job ?? '—'}</dd>
          <dt className="text-muted-on-card">취미</dt>
          <dd>{profile.hobbies.join(', ') || '—'}</dd>
          <dt className="text-muted-on-card">이상형 나이</dt>
          <dd>
            {profile.partnerBirthYearMin && profile.partnerBirthYearMax
              ? `${profile.partnerBirthYearMin}~${profile.partnerBirthYearMax}년생`
              : '—'}
          </dd>
        </dl>
      </details>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-bold text-fog-muted">게시 문구 (번호 없이 ✨로 시작)</span>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          rows={18}
          className="rounded-[12px] border-2 border-edge bg-card p-4 text-sm text-on-card"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <StampButton
          tone="ghost"
          disabled={!!busy}
          onClick={async () => {
            const saved = await call(
              `/api/profiles/${profile.id}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ finalBody: body }),
              },
              'save'
            );
            if (saved) setDirty(false);
          }}
        >
          {busy === 'save' ? '저장 중…' : '문구 저장'}
        </StampButton>

        <StampButton
          tone="yellow"
          disabled={!!busy}
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
            if (saved) {
              setDirty(false);
              await call(`/api/profiles/${profile.id}/approve`, { method: 'POST' }, 'approve');
            }
          }}
        >
          {busy === 'approve' ? '승인 중…' : '저장하고 승인'}
        </StampButton>

        <StampButton
          tone="red"
          className="ml-auto"
          disabled={!!busy}
          onClick={async () => {
            if (deleting.current) return;
            if (!confirm('이 프로필과 사진을 모두 삭제할까요?')) return;
            if (deleting.current) return;
            deleting.current = true;
            const done = await call(`/api/profiles/${profile.id}`, { method: 'DELETE' }, 'delete');
            if (done) {
              router.push('/admin');
            } else {
              deleting.current = false;
            }
          }}
        >
          삭제
        </StampButton>
      </div>

      {message && <p className="text-sm font-bold text-yellow">{message}</p>}
    </section>
  );
}

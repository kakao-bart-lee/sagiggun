'use client';

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
  // body가 아직 저장되지 않은 내용(사용자가 타이핑했거나, 방금 받은 새 작문
  // 초안)을 담고 있으면 true. 저장(문구 저장/저장하고 승인) 성공 시 false로
  // 돌아간다. "문구 작성"이 dirty 상태를 조용히 덮어쓰지 않도록 쓴다.
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  // disabled={!!busy}만으로는 삭제 연타를 완전히 막지 못한다 — 두 클릭이 같은
  // 틱에서 연달아 dispatch되면(예: 빠른 더블클릭) React가 busy 상태를 커밋해
  // 실제 DOM의 disabled 속성에 반영하기 전에 두 번째 클릭이 이미 핸들러에
  // 진입해 버릴 수 있다(직접 재현: b.click(); b.click()를 한 틱에서 실행하면
  // confirm() 두 번·DELETE 요청 두 번이 나가고, 서버가 경쟁 조건으로 첫 번째
  // 요청에 빈 바디 500을 준다). ref는 React 렌더링 사이클과 무관하게 즉시
  // 갱신되므로, 핸들러 맨 앞에서 동기적으로 체크하면 이 틈을 없앨 수 있다.
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
            // 미저장 편집(직접 타이핑했거나 지난 작문 결과를 아직 저장 안 한
            // 상태)이 있으면 재작문이 그걸 조용히 덮어쓰기 전에 먼저 물어본다.
            // LLM 호출 비용이 드는 요청이라 거절하면 아예 호출하지 않는다.
            if (dirty && !confirm('작성 중인 내용이 있습니다. 새 초안으로 덮어쓸까요?')) return;

            const result = await call(`/api/profiles/${profile.id}/compose`, { method: 'POST' }, 'compose');
            // call()의 router.refresh()는 이 서버 컴포넌트 트리를 다시 그리지만
            // ProfileEditor는 리마운트되지 않으므로 useState(profile.finalBody ?? '')
            // 초기값은 다시 평가되지 않는다 — 그대로 두면 작문이 성공해도 텍스트
            // 영역이 갱신되지 않는다.
            //
            // 응답에서 finalBody가 아니라 draftBody를 읽는다: compose 라우트
            // (compose/route.ts:80)는 `finalBody: profile.finalBody ?? draftBody`로
            // 저장한다 — 즉 finalBody가 이미 값을 갖고 있으면(첫 작문 이후 항상
            // 그렇다) 응답의 finalBody는 LLM 호출 "전"의 옛 값이고, 방금 생성된
            // 새 문구는 항상 draftBody에 담겨 온다. finalBody를 읽으면 첫 작문만
            // 우연히 맞고 재작문(가장 흔한 경로)에서는 화면이 안 바뀐다.
            if (result?.profile?.draftBody != null) {
              setBody(result.profile.draftBody);
              // 새로 받은 초안은 아직 저장 전이다 — 여기서 dirty를 켜 둬야
              // 이 상태로 또 재작문을 누르면 방금 받은 초안도 지켜진다.
              setDirty(true);
            }
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
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          rows={20}
          className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm"
        />
      </label>

      <div className="flex gap-2">
        <button
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
            // 화면의 body가 이제 서버의 finalBody와 일치하므로 dirty를 해제한다.
            if (saved) setDirty(false);
          }}
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
            if (saved) {
              setDirty(false);
              await call(`/api/profiles/${profile.id}/approve`, { method: 'POST' }, 'approve');
            }
          }}
          disabled={!!busy}
          className="rounded-lg bg-neutral-100 px-4 py-2 font-medium text-neutral-900 disabled:opacity-50"
        >
          {busy === 'approve' ? '승인 중…' : '저장하고 승인'}
        </button>

        <button
          onClick={async () => {
            // busy(React state)는 여기서 체크하지 않는다 — disabled={!!busy}와
            // 같은 렌더-커밋 지연을 그대로 갖고 있어서 이 클로저에서 다시 읽어도
            // 보호가 늘지 않는다. deleting.current만이 동기적으로 신뢰할 수 있다.
            if (deleting.current) return;
            if (!confirm('이 프로필과 사진을 모두 삭제할까요?')) return;
            // confirm()이 열려 있는 동안 또 다른 클릭이 들어왔을 가능성까지
            // 닫고 나서 한 번 더 확인한다.
            if (deleting.current) return;
            deleting.current = true;
            const done = await call(`/api/profiles/${profile.id}`, { method: 'DELETE' }, 'delete');
            if (done) {
              router.push('/admin');
            } else {
              deleting.current = false;
            }
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

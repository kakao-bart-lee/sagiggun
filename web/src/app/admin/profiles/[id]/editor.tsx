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

function linesToList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function listToLines(values: string[]): string {
  return values.join('\n');
}

const fieldClass =
  'rounded-[8px] border-2 border-edge bg-field p-2 text-sm text-on-card';
const labelClass = 'text-xs font-bold text-muted-on-card';

export function ProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [body, setBody] = useState(profile.finalBody ?? '');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const deleting = useRef(false);

  const [gender, setGender] = useState(profile.gender ?? '');
  const [birthYear, setBirthYear] = useState(profile.birthYear?.toString() ?? '');
  const [region, setRegion] = useState(profile.region ?? '');
  const [heightCm, setHeightCm] = useState(profile.heightCm?.toString() ?? '');
  const [job, setJob] = useState(profile.job ?? '');
  const [hobbies, setHobbies] = useState(listToLines(profile.hobbies));
  const [appealPoints, setAppealPoints] = useState(listToLines(profile.appealPoints));
  const [idealType, setIdealType] = useState(listToLines(profile.idealType));
  const [partnerMin, setPartnerMin] = useState(profile.partnerBirthYearMin?.toString() ?? '');
  const [partnerMax, setPartnerMax] = useState(profile.partnerBirthYearMax?.toString() ?? '');
  const [partnerRegions, setPartnerRegions] = useState(listToLines(profile.partnerRegions));
  const [dealBreakers, setDealBreakers] = useState(listToLines(profile.dealBreakers));

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

  function extractPayload() {
    const n = (v: string) => {
      const t = v.trim();
      if (!t) return null;
      const num = Number(t);
      return Number.isFinite(num) ? Math.trunc(num) : null;
    };
    return {
      gender: gender === 'F' || gender === 'M' ? gender : null,
      birthYear: n(birthYear),
      region: region.trim() || null,
      heightCm: n(heightCm),
      job: job.trim() || null,
      hobbies: linesToList(hobbies),
      appealPoints: linesToList(appealPoints),
      idealType: linesToList(idealType),
      partnerBirthYearMin: n(partnerMin),
      partnerBirthYearMax: n(partnerMax),
      partnerRegions: linesToList(partnerRegions),
      dealBreakers: linesToList(dealBreakers),
    };
  }

  const archived = profile.status === 'ARCHIVED';
  const approved = profile.status === 'APPROVED';

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
          disabled={!!busy || archived}
          className="min-h-10 px-3 py-2 text-sm"
        >
          {busy === 'extract' ? '추출 중…' : '추출 실행'}
        </StampButton>
        <StampButton
          tone="blue"
          className="min-h-10 px-3 py-2 text-sm"
          disabled={!!busy || archived}
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

      <details open className="rounded-[12px] border-2 border-edge bg-card p-4 text-on-card">
        <summary className="cursor-pointer text-sm font-bold text-muted-on-card">추출된 항목</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>성별</span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={fieldClass}
            >
              <option value="">미상</option>
              <option value="F">F</option>
              <option value="M">M</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>출생연도</span>
            <input
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className={fieldClass}
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>지역</span>
            <input value={region} onChange={(e) => setRegion(e.target.value)} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>키(cm)</span>
            <input
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className={fieldClass}
              inputMode="numeric"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className={labelClass}>직업</span>
            <input value={job} onChange={(e) => setJob(e.target.value)} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>취미 (줄바꿈/콤마)</span>
            <textarea
              value={hobbies}
              onChange={(e) => setHobbies(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>본인 장점</span>
            <textarea
              value={appealPoints}
              onChange={(e) => setAppealPoints(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>이상형</span>
            <textarea
              value={idealType}
              onChange={(e) => setIdealType(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>가능 지역</span>
            <textarea
              value={partnerRegions}
              onChange={(e) => setPartnerRegions(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>이상형 출생연도 최소</span>
            <input
              value={partnerMin}
              onChange={(e) => setPartnerMin(e.target.value)}
              className={fieldClass}
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>이상형 출생연도 최대</span>
            <input
              value={partnerMax}
              onChange={(e) => setPartnerMax(e.target.value)}
              className={fieldClass}
              inputMode="numeric"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className={labelClass}>절대 안 되는 것</span>
            <textarea
              value={dealBreakers}
              onChange={(e) => setDealBreakers(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
        </div>
        <StampButton
          tone="ghost"
          className="mt-3 min-h-10 px-3 py-2 text-sm"
          disabled={!!busy}
          onClick={() =>
            call(
              `/api/profiles/${profile.id}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(extractPayload()),
              },
              'extract-save'
            )
          }
        >
          {busy === 'extract-save' ? '저장 중…' : '추출 저장'}
        </StampButton>
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

        {!archived && (
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
        )}

        {approved && (
          <StampButton
            tone="blue"
            disabled={!!busy}
            onClick={() => {
              if (!confirm('손으로 게시한 뒤 상태를 게시됨으로 표시할까요? (Threads API 없음)')) {
                return;
              }
              return call(`/api/profiles/${profile.id}/publish-mark`, { method: 'POST' }, 'publish');
            }}
          >
            {busy === 'publish' ? '표시 중…' : '게시됨으로 표시'}
          </StampButton>
        )}

        {archived ? (
          <StampButton
            tone="ghost"
            disabled={!!busy}
            onClick={() =>
              call(
                `/api/profiles/${profile.id}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'UNARCHIVE' }),
                },
                'unarchive'
              )
            }
          >
            {busy === 'unarchive' ? '해제 중…' : '보관 해제'}
          </StampButton>
        ) : (
          <StampButton
            tone="ghost"
            disabled={!!busy}
            onClick={() => {
              if (!confirm('이 프로필을 보관할까요? 목록 기본 뷰에서 숨겨집니다.')) return;
              return call(
                `/api/profiles/${profile.id}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'ARCHIVED' }),
                },
                'archive'
              );
            }}
          >
            {busy === 'archive' ? '보관 중…' : '보관'}
          </StampButton>
        )}

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

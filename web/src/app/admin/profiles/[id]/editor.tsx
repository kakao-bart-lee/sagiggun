'use client';

import { StampButton, StatusSeal } from '@/components/admin-ui';
import { STATUS_LABEL, statusTone } from '@/lib/ui';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

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

/**
 * 이상형 나이 범위를 사람이 읽는 순서(어린 쪽 → 많은 쪽)로 요약한다.
 * 출생연도가 작을수록 나이가 많으므로 min/max와 순서가 뒤집힌다 — 그 혼란을 없애는 것이 목적이다.
 */
function partnerAgeRange(minYear: string, maxYear: string): string {
  const early = Number(minYear.trim());
  const late = Number(maxYear.trim());
  if (!minYear.trim() || !maxYear.trim() || !Number.isFinite(early) || !Number.isFinite(late)) {
    return '';
  }
  const now = new Date().getFullYear();
  const [youngest, oldest] = [now - Math.max(early, late), now - Math.min(early, late)];
  const [fromYear, toYear] = [Math.min(early, late), Math.max(early, late)];
  return `${youngest}~${oldest}세 (${fromYear}~${toYear}년생)`;
}

/**
 * 출생연도 입력값을 나이로 환산해 라벨에 덧붙인다. 추출된 연도가 실제 나이와 맞는지
 * 사람이 한눈에 검산할 수 있게 하기 위함이다.
 *
 * 만 나이가 아니라 연 나이(올해 - 출생연도)를 쓴다. EXTRACT_SYSTEM이 "27살 → 기준연도-27"로
 * 똑같이 계산하므로, 프롬프트 산술을 그대로 되짚어봐야 검산이 성립한다.
 * 여기를 만 나이로 "고치면" 검산 기능이 깨진다 — 생일 경과에 따른 최대 1년 오차는
 * 사람 검수로 잡는다.
 */
function ageLabel(value: string): string {
  const year = Number(value.trim());
  if (!value.trim() || !Number.isFinite(year)) return '';
  const age = new Date().getFullYear() - year;
  return ` (${age}세)`;
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
  const [copied, setCopied] = useState(false);
  const deleting = useRef(false);
  const finalBodyId = useId();

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage('복사에 실패했습니다. 직접 선택해서 복사해 주세요.');
    }
  }

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
          onClick={async () => {
            const result = await call(
              `/api/profiles/${profile.id}/extract`,
              { method: 'POST' },
              'extract'
            );
            const updated = result?.profile;
            if (updated) {
              setGender(updated.gender ?? '');
              setBirthYear(updated.birthYear?.toString() ?? '');
              setRegion(updated.region ?? '');
              setHeightCm(updated.heightCm?.toString() ?? '');
              setJob(updated.job ?? '');
              // 배열 필드는 ?? []로 받는다. 응답이 any라서 shape이 바뀌면
              // listToLines()의 join이 TypeError로 터지고 버튼이 조용히 죽는다.
              setHobbies(listToLines(updated.hobbies ?? []));
              setAppealPoints(listToLines(updated.appealPoints ?? []));
              setIdealType(listToLines(updated.idealType ?? []));
              setPartnerMin(updated.partnerBirthYearMin?.toString() ?? '');
              setPartnerMax(updated.partnerBirthYearMax?.toString() ?? '');
              setPartnerRegions(listToLines(updated.partnerRegions ?? []));
              setDealBreakers(listToLines(updated.dealBreakers ?? []));
            }
          }}
          disabled={!!busy || archived}
          className="min-h-10 px-3 py-2 text-sm"
        >
          {busy === 'extract' ? '추출 중…' : '추출 실행'}
        </StampButton>
      </div>

      <details open className="rounded-[12px] border-2 border-edge bg-card p-4 text-on-card">
        <summary className="cursor-pointer text-sm font-bold text-muted-on-card">추출된 항목</summary>
        {/* 브레이크포인트 없이 항상 2열이라 375px에서 필드마다 140px로 눌렸다(특히
            "이상형 출생연도 이른 쪽" 같은 긴 라벨). sm 밑에서는 1열로 푼다. */}
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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
            <span className={labelClass}>출생연도{ageLabel(birthYear)}</span>
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
          <label className="sm:col-span-2 flex flex-col gap-1">
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
          {/* 「최소/최대」는 출생연도 기준이라 사람이 나이로 읽으면 거꾸로 보인다
              (최소=1995=31세). 「이른 쪽/늦은 쪽」으로 바꾸고 아래에 나이 범위를 함께 적는다. */}
          <label className="flex flex-col gap-1">
            <span className={labelClass}>이상형 출생연도 이른 쪽{ageLabel(partnerMin)}</span>
            <input
              value={partnerMin}
              onChange={(e) => setPartnerMin(e.target.value)}
              className={fieldClass}
              inputMode="numeric"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>이상형 출생연도 늦은 쪽{ageLabel(partnerMax)}</span>
            <input
              value={partnerMax}
              onChange={(e) => setPartnerMax(e.target.value)}
              className={fieldClass}
              inputMode="numeric"
            />
          </label>
          {partnerAgeRange(partnerMin, partnerMax) && (
            <p className="sm:col-span-2 -mt-1 text-xs font-bold text-muted-on-card">
              → {partnerAgeRange(partnerMin, partnerMax)}
            </p>
          )}
          <label className="sm:col-span-2 flex flex-col gap-1">
            <span className={labelClass}>절대 안 되는 것</span>
            <textarea
              value={dealBreakers}
              onChange={(e) => setDealBreakers(e.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StampButton
            tone="ghost"
            className="min-h-10 px-3 py-2 text-sm"
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
      </details>

      {/* 복사 버튼을 label 안에 두면 암묵적 연결 때문에 textarea의 접근명이
          "게시 문구 … 복사"가 되고, 누를 때마다 "복사됨"으로 바뀐다. 헤더 행을
          label 밖으로 빼고 htmlFor로 명시적으로 연결한다. */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={finalBodyId} className="text-sm font-bold text-fog-muted">
            게시 문구 (번호 없이 ✨로 시작)
          </label>
          <StampButton
            type="button"
            tone="ghost"
            className="min-h-8 px-3 py-1 text-xs"
            onClick={copyBody}
          >
            {copied ? '복사됨' : '복사'}
          </StampButton>
        </div>
        <textarea
          id={finalBodyId}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          rows={18}
          className="rounded-[12px] border-2 border-edge bg-card p-4 text-sm leading-snug text-on-card"
        />
      </div>

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
              if (!confirm('Threads에 바로 게시할까요? 게시 후에는 취소할 수 없습니다.')) {
                return;
              }
              return call(`/api/profiles/${profile.id}/publish`, { method: 'POST' }, 'publish');
            }}
          >
            {busy === 'publish' ? '게시 중…' : 'API로 게시'}
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

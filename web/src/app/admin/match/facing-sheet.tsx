'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CandidateView } from '@/lib/match/candidates';
import type { DimScore } from '@/lib/match/score';

type SubjectOption = {
  id: string;
  seq: number | null;
  gender: string | null;
  birthYear: number | null;
  region: string | null;
};

type Loaded = {
  subject: {
    id: string;
    seq: number | null;
    gender: string | null;
    birthYear: number | null;
    region: string | null;
    heightCm: number | null;
    job: string | null;
    partnerBirthYearMin: number | null;
    partnerBirthYearMax: number | null;
    partnerRegions: string[];
    dealBreakers: string[];
  };
  candidates: CandidateView[];
};

/* DESIGN.md 면별 사람 색 쌍 — 종이 위에서는 진한 쪽, 숯색 위에서는 밝은 쪽 */
const PERSON = {
  paper: { M: '#1f4fa8', F: '#b3243f' },
  ink: { M: '#6a99f1', F: '#ea6a80' },
} as const;

const sexKo = (g: string | null) => (g === 'F' ? '여' : g === 'M' ? '남' : '미상');
const other = (g: string | null) => (g === 'F' ? 'M' : 'F');
const colorOf = (g: string | null, on: 'paper' | 'ink') =>
  PERSON[on][(g === 'F' ? 'F' : 'M') as 'F' | 'M'];

const REAL_MISS = 0.7;
const HARD_MISS = 0.5;

function label(no: number | null) {
  return no != null ? `${no}번` : '번호 미발급';
}

function verdict(c: CandidateView, subjNo: string, candNo: string, hardMiss: boolean) {
  if (Math.abs(c.mine - c.theirs) >= 0.18) {
    const lean = c.mine > c.theirs;
    return {
      mark: '◐',
      text: '한쪽만 맞아요',
      why: lean
        ? `${subjNo}은 마음에 들어 하실 텐데, ${candNo}이 찾는 조건과는 거리가 있어요.`
        : `${candNo}은 좋아하실 텐데, ${subjNo}이 찾는 조건과는 거리가 있어요.`,
    };
  }
  if (c.harmonic >= 0.8 && !hardMiss) return { mark: '●', text: '서로 잘 맞아요', why: null };
  if (c.harmonic >= 0.65)
    return {
      mark: '◑',
      text: '무난해요',
      why: hardMiss ? '대체로 맞는데 한 가지가 걸립니다.' : null,
    };
  return { mark: '○', text: '잘 안 맞아요', why: '양쪽 조건이 여러 군데 어긋납니다.' };
}

/**
 * 조건 한 줄. 충족 표시와 **상대의 실제 값**을 함께 둔다 —
 * 왜 ✓인지 ✕인지 다른 데를 보지 않아도 그 줄에서 끝나야 한다.
 * 안 맞는 줄은 명암을 뒤집는다: 요구치는 흐리게, 걸림돌이 된 실제 값은 진하게.
 */
function Row({ part, otherNo }: { part: DimScore; otherNo: string }) {
  const { state } = part;
  const glyph = state === 'match' ? '✓' : state === 'miss' ? '✕' : '–';
  return (
    <div className="mt-3 first:mt-0">
      <div className="text-[11px] font-extrabold tracking-wide text-muted-on-card">
        찾는 {part.dim}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          aria-label={
            state === 'match' ? '충족' : state === 'miss' ? '안 맞음' : '판단할 정보 없음'
          }
          className={[
            'inline-flex h-[21px] w-[21px] flex-none items-center justify-center rounded-full border-2 text-[11px] font-extrabold',
            state === 'match'
              ? 'border-on-card bg-on-card text-card'
              : state === 'miss'
                ? 'border-on-card text-on-card'
                : 'border-dashed border-muted-on-card text-muted-on-card',
          ].join(' ')}
        >
          {glyph}
        </span>
        <span
          className={`text-sm font-bold ${state === 'miss' ? 'text-muted-on-card' : 'text-on-card'}`}
        >
          {part.want ?? <span className="font-semibold text-muted-on-card">안 적으셨어요</span>}
        </span>
        {part.has && (
          <span
            className={`ml-auto whitespace-nowrap text-[11px] font-bold ${
              state === 'miss' ? 'text-on-card' : 'text-muted-on-card'
            }`}
          >
            {otherNo} {part.has}
          </span>
        )}
      </div>
    </div>
  );
}

export function FacingSheet({ subjects }: { subjects: SubjectOption[] }) {
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [data, setData] = useState<Loaded | null>(null);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setBusy(true);
    setError('');
    const res = await fetch(`/api/profiles/${id}/candidates`);
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? '후보를 불러오지 못했습니다.');
      setData(null);
      return;
    }
    setData(json);
    setAt(0);
  }, []);

  useEffect(() => {
    void load(subjectId);
  }, [subjectId, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') setAt((v) => Math.max(0, v - 1));
      if (e.key === 'ArrowRight')
        setAt((v) => Math.min((data?.candidates.length ?? 1) - 1, v + 1));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [data]);

  const s = data?.subject;
  const list = data?.candidates ?? [];
  const c = list[at];

  const meSex = s?.gender ?? null;
  const youSex = other(meSex);
  const subjNo = label(s?.seq ?? null);
  const candNo = label(c?.seq ?? null);

  const allParts = c ? [...c.mineParts, ...c.theirParts] : [];
  const hardMiss = allParts.some((p) => p.state === 'miss' && p.score < HARD_MISS);
  const v = c ? verdict(c, subjNo, candNo, hardMiss) : null;

  const bad = c
    ? allParts.filter((p) => p.state === 'miss' && p.score < REAL_MISS).length
    : 0;
  const ask = c ? allParts.filter((p) => p.state === 'unknown').length : 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b-2 border-edge pb-4">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-fog">소개할 사람 고르기</h1>
          <p className="mt-1 text-[13px] text-fog-muted">
            조건이 <b>서로</b> 맞는지 양쪽으로 따져 줄을 세웁니다. 나이·키·얼굴상·지역 네 가지만
            봅니다.
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-extrabold text-fog-muted">누구에게 소개할까요?</span>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="min-h-[42px] min-w-[260px] rounded-[8px] border-2 border-edge bg-field px-3 py-2 font-bold text-on-card"
          >
            {subjects.map((o) => (
              <option key={o.id} value={o.id}>
                {label(o.seq)} · {sexKo(o.gender)} · {o.birthYear ?? '연도 미상'}년생 ·{' '}
                {o.region ?? '지역 미상'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {busy && <p className="text-sm text-fog-muted">불러오는 중…</p>}
      {error && <p className="text-sm font-bold text-telop-red">{error}</p>}

      {!busy && !error && list.length === 0 && (
        <div className="rounded-[12px] border-2 border-edge bg-card p-6 font-semibold text-muted-on-card">
          소개할 만한 사람이 없습니다. 조건을 넓히거나 새 신청을 기다려야 해요.
        </div>
      )}

      {c && s && v && (
        <>
          {/*
            번호를 전부 늘어놓는 레일이었는데, 실데이터에서 후보가 30명을 넘자
            절반이 가로 스크롤 뒤로 숨었다. 이 화면은 점수 순으로 위에서부터
            태워나가는 곳이라 번호 인덱스가 애초에 맞지 않는 장치였다.
          */}
          <nav className="flex items-center gap-3 border-b-2 border-edge py-3" aria-label="후보 넘기기">
            <Step dir="prev" disabled={at === 0} onClick={() => setAt((a) => a - 1)} />
            <span className="text-sm font-extrabold tabular-nums text-fog">
              {at + 1}
              <span className="font-bold text-fog-muted"> / {list.length}</span>
            </span>
            <Step
              dir="next"
              disabled={at >= list.length - 1}
              onClick={() => setAt((a) => a + 1)}
            />
            <span className="ml-auto text-[11px] font-extrabold text-fog-muted">
              짝 점수가 높은 순
            </span>
          </nav>

          <div className="flex items-center gap-3 pb-3 pt-5">
            <span className="text-lg" style={{ color: colorOf(meSex, 'ink') }} aria-hidden>
              {v.mark}
            </span>
            <span className="text-[32px] font-extrabold leading-tight tracking-tight text-fog">
              {v.text}
            </span>
          </div>
          {v.why && <p className="mb-4 max-w-[62ch] text-sm font-semibold text-fog-muted">{v.why}</p>}

          <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1fr_232px_1fr]">
            <section
              className="rounded-[12px] border-2 bg-card p-4 text-on-card lg:order-1"
              style={{ borderColor: colorOf(meSex, 'ink') }}
            >
              <Head no={subjNo} sex={meSex} role="소개받는 분" />
              <p className="mt-3 text-sm font-semibold text-muted-on-card">
                {s.birthYear ?? '연도 미상'}년생 · {s.region ?? '지역 미상'} ·{' '}
                {s.heightCm ? `${s.heightCm}cm` : '키 미상'}
                {s.job ? ` · ${s.job}` : ''}
              </p>
              <div className="mt-3 border-t-2 border-card-line pt-3">
                {c.mineParts.map((p) => (
                  <Row key={p.dim} part={p} otherNo={candNo} />
                ))}
              </div>
            </section>

            <aside className="px-3 pt-1 lg:order-2">
              <h2 className="mb-3 text-[11px] font-extrabold tracking-widest text-fog-muted">맞물림</h2>
              <Beam name={subjNo} value={c.mine} color={colorOf(meSex, 'ink')} />
              <Beam name={candNo} value={c.theirs} color={colorOf(youSex, 'ink')} />
              <div className="mt-4 border-t-2 border-edge pt-3 text-[13px] font-semibold text-fog">
                <div className="text-[11px] font-extrabold tracking-wide text-fog-muted">
                  {bad > 0 ? '안 맞는 조건' : ask > 0 ? '확인 필요' : '걸리는 것'}
                </div>
                <div className="mt-1">
                  {bad > 0 ? `${bad}가지` : ask > 0 ? `${ask}가지 정보 없음` : '없습니다'}
                </div>
              </div>
            </aside>

            <section className="rounded-[12px] border-2 border-edge bg-card p-4 text-on-card lg:order-3">
              <Head no={candNo} sex={youSex} role="후보" />
              <p className="mt-3 text-sm font-semibold text-muted-on-card">
                {c.birthYear ?? '연도 미상'}년생 · {c.region ?? '지역 미상'} ·{' '}
                {c.heightCm ? `${c.heightCm}cm` : '키 미상'}
                {c.job ? ` · ${c.job}` : ''}
              </p>
              <div className="mt-3 border-t-2 border-card-line pt-3">
                {c.theirParts.map((p) => (
                  <Row key={p.dim} part={p} otherNo={subjNo} />
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Step({
  dir,
  disabled,
  onClick,
}: {
  dir: 'prev' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const prev = dir === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={prev ? '이전 후보' : '다음 후보'}
      title={`${prev ? '이전' : '다음'} 후보 (${prev ? '←' : '→'})`}
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[8px] border-2 border-fog-muted text-fog hover:border-fog disabled:opacity-30 disabled:hover:border-fog-muted"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <path
          d={prev ? 'M11.5 4.5 6.5 9.5l5 5' : 'M6.5 4.5l5 5-5 5'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Head({ no, sex, role }: { no: string; sex: string | null; role: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[22px] font-extrabold leading-none tracking-tight">{no}</span>
      <span
        className="inline-flex items-center rounded-full border-2 px-2 py-0.5 text-[11px] font-extrabold"
        style={{ color: colorOf(sex, 'paper'), borderColor: colorOf(sex, 'paper') }}
      >
        {sexKo(sex)}
      </span>
      <span className="ml-auto text-[11px] font-extrabold tracking-wider text-muted-on-card">
        {role}
      </span>
    </div>
  );
}

function Beam({ name, value, color }: { name: string; value: number; color: string }) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 flex items-baseline justify-between text-[11px] font-bold text-fog">
        <span>{name}이 보기에</span>
        <b className="text-sm font-extrabold">{Math.round(value * 100)}</b>
      </div>
      <span className="block h-[13px] overflow-hidden rounded-[6px] bg-ink-elevated">
        <span
          className="block h-full rounded-[6px]"
          style={{ width: `${value * 100}%`, background: color }}
        />
      </span>
    </div>
  );
}

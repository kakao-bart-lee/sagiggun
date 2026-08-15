import type { MatchProfileSlice } from '@/lib/match/filter';
import { regionLabel, regionsOverlap } from '@/lib/match/region';

export type DimState = 'match' | 'miss' | 'unknown';
export type DimScore = {
  dim: string;
  score: number;
  state: DimState;
  /** 이 조건을 적은 사람이 원한 것. 화면이 그대로 읽는다. 조건이 없으면 null */
  want: string | null;
  /** 상대가 실제로 가진 값. 왜 맞는지/안 맞는지의 근거. 모르면 null */
  has: string | null;
};
export type DirectionScore = { score: number; parts: DimScore[] };

/** 키·얼굴상은 이제 실재하는 컬럼이다. 비어 있으면 미상으로 떨어진다. */
export type ScoreSlice = MatchProfileSlice;

/** 조건을 안 적었거나 상대 값을 모를 때. 맞는다고 보지도, 깎지도 않는다. */
const NEUTRAL = 0.6;

const WEIGHTS = { 나이: 0.3, 키: 0.3, 얼굴상: 0.2, 지역: 0.2 } as const;

/** 년생은 작을수록 연상이라 「이상/이하」가 뒤집힌다 — 부터/까지로 쓴다 */
function yearText(lo: number | null | undefined, hi: number | null | undefined) {
  if (lo == null && hi == null) return null;
  if (lo == null) return `${hi}년생까지`;
  if (hi == null) return `${lo}년생부터`;
  return `${lo}~${hi}년생`;
}

function cmText(lo: number | null | undefined, hi: number | null | undefined) {
  if (lo == null && hi == null) return null;
  if (lo == null) return `${hi}cm 이하`;
  if (hi == null) return `${lo}cm 이상`;
  return `${lo}~${hi}cm`;
}

type Made = { score: number; state: DimState };

const make = (dim: string, want: string | null, has: string | null, m: Made): DimScore => ({
  dim,
  want,
  has,
  score: Math.max(0, m.score),
  state: m.state,
});

const NEUTRAL_MADE: Made = { score: NEUTRAL, state: 'unknown' };
const MATCHED: Made = { score: 1, state: 'match' };

/** 구간을 벗어난 만큼만 깎는다. 경계 한 칸 차이를 0으로 만들지 않기 위해서다. */
function ranged(
  dim: string,
  want: string | null,
  has: string | null,
  value: number | null | undefined,
  lo: number | null | undefined,
  hi: number | null | undefined,
  falloff: number
): DimScore {
  if (want == null || value == null) return make(dim, want, has, NEUTRAL_MADE);
  const over = Math.max(
    lo != null && value < lo ? lo - value : 0,
    hi != null && value > hi ? value - hi : 0
  );
  return make(dim, want, has, over === 0 ? MATCHED : { score: 1 - over / falloff, state: 'miss' });
}

function scoreFace(me: ScoreSlice, other: ScoreSlice): DimScore {
  const wantList = me.partnerFaceTypes ?? [];
  const want = wantList.length ? wantList.join('·') : null;
  const has = other.faceType ?? null;
  if (!want || !has) return make('얼굴상', want, has, NEUTRAL_MADE);
  return make(
    '얼굴상',
    want,
    has,
    wantList.includes(has) ? MATCHED : { score: 0.25, state: 'miss' }
  );
}

/**
 * 지역은 양쪽을 광역 코드로 바꾼 뒤 교집합으로 본다. 문자열을 그대로 비교하면
 * 대구와 경상도가 남남이 되고, 실데이터 지역 판정의 80%가 그렇게 ✕로 떨어졌다.
 * 찾는 지역은 원문이 문장이라 라벨로 줄여 보여주고, 사는 곳은 짧으니 적어낸 대로 둔다.
 */
function scoreRegion(me: ScoreSlice, other: ScoreSlice): DimScore {
  const list = me.partnerRegions ?? [];
  const want = regionLabel(list);
  const has = other.region?.trim() ? other.region : null;
  const overlap = regionsOverlap([other.region], list);
  if (overlap == null) return make('지역', want, has, NEUTRAL_MADE);
  return make('지역', want, has, overlap ? MATCHED : { score: 0.2, state: 'miss' });
}

/** me가 적은 조건에 other가 얼마나 맞는가. 0~1. */
export function scoreDirection(me: ScoreSlice, other: ScoreSlice): DirectionScore {
  const parts: DimScore[] = [
    ranged(
      '나이',
      yearText(me.partnerBirthYearMin, me.partnerBirthYearMax),
      other.birthYear != null ? `${other.birthYear}년생` : null,
      other.birthYear,
      me.partnerBirthYearMin,
      me.partnerBirthYearMax,
      6
    ),
    ranged(
      '키',
      cmText(me.partnerHeightMin, me.partnerHeightMax),
      other.heightCm != null ? `${other.heightCm}cm` : null,
      other.heightCm,
      me.partnerHeightMin,
      me.partnerHeightMax,
      12
    ),
    scoreFace(me, other),
    scoreRegion(me, other),
  ];
  const score = parts.reduce((sum, p) => sum + p.score * WEIGHTS[p.dim as keyof typeof WEIGHTS], 0);
  return { score, parts };
}

/**
 * 두 방향 점수를 하나로 묶는다 (RECON, Pizzato et al. RecSys '10).
 *
 * 산술평균은 한쪽의 열의가 다른 쪽의 무관심을 구제해 버리고, 기하평균은
 * 지나치게 비관적이다. 조화평균은 최솟값에 가까워 「양쪽 다 충분히 관심
 * 있어야 한다」는 요건을 그대로 반영한다.
 */
export function harmonic(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
}

export function scorePair(a: ScoreSlice, b: ScoreSlice) {
  const mine = scoreDirection(a, b).score;
  const theirs = scoreDirection(b, a).score;
  return { mine, theirs, harmonic: harmonic(mine, theirs) };
}

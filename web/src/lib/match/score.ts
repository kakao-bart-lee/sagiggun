import { regionCompatible, type MatchProfileSlice } from '@/lib/match/filter';

export type DimState = 'match' | 'miss' | 'unknown';
export type DimScore = { dim: string; score: number; state: DimState };
export type DirectionScore = { score: number; parts: DimScore[] };

/**
 * 키·얼굴상은 아직 스키마에 없다. 값이 없으면 미상으로 떨어지므로,
 * 마이그레이션이 들어오면 이 모듈은 손대지 않아도 켜진다.
 */
export type ScoreSlice = MatchProfileSlice &
  Partial<{
    partnerHeightMin: number | null;
    partnerHeightMax: number | null;
    faceType: string | null;
    partnerFaceTypes: string[];
  }>;

/** 조건을 안 적었거나 상대 값을 모를 때. 맞는다고 보지도, 깎지도 않는다. */
const NEUTRAL = 0.6;

const WEIGHTS = { 나이: 0.3, 키: 0.3, 얼굴상: 0.2, 지역: 0.2 } as const;

const unknown = (dim: string): DimScore => ({ dim, score: NEUTRAL, state: 'unknown' });
const match = (dim: string): DimScore => ({ dim, score: 1, state: 'match' });
const miss = (dim: string, score: number): DimScore => ({
  dim,
  score: Math.max(0, score),
  state: 'miss',
});

/** 구간을 벗어난 만큼만 깎는다. 경계 한 칸 차이를 0으로 만들지 않기 위해서다. */
function ranged(
  dim: string,
  value: number | null | undefined,
  lo: number | null | undefined,
  hi: number | null | undefined,
  falloff: number
): DimScore {
  if (lo == null && hi == null) return unknown(dim);
  if (value == null) return unknown(dim);
  const over = Math.max(
    lo != null && value < lo ? lo - value : 0,
    hi != null && value > hi ? value - hi : 0
  );
  return over === 0 ? match(dim) : miss(dim, 1 - over / falloff);
}

function scoreFace(me: ScoreSlice, other: ScoreSlice): DimScore {
  const want = me.partnerFaceTypes ?? [];
  if (want.length === 0) return unknown('얼굴상');
  if (!other.faceType) return unknown('얼굴상');
  return want.includes(other.faceType) ? match('얼굴상') : miss('얼굴상', 0.25);
}

function scoreRegion(me: ScoreSlice, other: ScoreSlice): DimScore {
  if ((me.partnerRegions ?? []).length === 0) return unknown('지역');
  if (!other.region?.trim()) return unknown('지역');
  return regionCompatible(other.region, me.partnerRegions) ? match('지역') : miss('지역', 0.2);
}

/** me가 적은 조건에 other가 얼마나 맞는가. 0~1. */
export function scoreDirection(me: ScoreSlice, other: ScoreSlice): DirectionScore {
  const parts: DimScore[] = [
    ranged('나이', other.birthYear, me.partnerBirthYearMin, me.partnerBirthYearMax, 6),
    ranged('키', other.heightCm, me.partnerHeightMin, me.partnerHeightMax, 12),
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

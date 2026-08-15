import type { Profile } from '@prisma/client';

export type MatchProfileSlice = Pick<
  Profile,
  | 'id'
  | 'seq'
  | 'sourceHandle'
  | 'status'
  | 'gender'
  | 'birthYear'
  | 'region'
  | 'partnerBirthYearMin'
  | 'partnerBirthYearMax'
  | 'partnerRegions'
  | 'dealBreakers'
  | 'faceType'
  | 'partnerFaceTypes'
  | 'partnerHeightMin'
  | 'partnerHeightMax'
  | 'idealType'
  | 'hobbies'
  | 'appealPoints'
  | 'job'
  | 'heightCm'
>;

const CANDIDATE_STATUSES = new Set(['APPROVED', 'PUBLISHED']);

/** birthYear가 [min,max] 안에 있는지. 구간이 비면(둘 다 null) 통과. */
export function birthYearInRange(
  birthYear: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined
): boolean {
  if (min == null && max == null) return true;
  if (birthYear == null) return true; // 정보 없으면 필터로 탈락시키지 않음
  if (min != null && birthYear < min) return false;
  if (max != null && birthYear > max) return false;
  return true;
}

/** 지역 힌트: 한쪽 partnerRegions가 비면 통과. 둘 다 있으면 교집합/부분문자열. */
export function regionCompatible(
  region: string | null | undefined,
  partnerRegions: string[] | null | undefined
): boolean {
  const wanted = (partnerRegions ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return true;
  if (!region?.trim()) return true;
  const mine = region.trim().toLowerCase();
  return wanted.some((w) => mine.includes(w) || w.includes(mine));
}

/**
 * dealBreaker 키워드가 상대 요약 텍스트에 포함되면 탈락.
 * 간단한 부분문자열 — LLM이 재평가한다.
 */
export function dealBreakerHit(
  dealBreakers: string[] | null | undefined,
  againstText: string
): boolean {
  const hay = againstText.toLowerCase();
  for (const raw of dealBreakers ?? []) {
    const token = raw.trim().toLowerCase();
    if (token.length >= 2 && hay.includes(token)) return true;
  }
  return false;
}

function summaryText(p: MatchProfileSlice): string {
  return [
    p.job,
    p.region,
    ...(p.hobbies ?? []),
    ...(p.appealPoints ?? []),
    ...(p.idealType ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

export type FilterOptions = {
  /** 이미 수락/거절로 판정이 끝난 상대. 방향과 무관하게 다시 올리지 않는다. */
  excludeIds?: ReadonlySet<string>;
};

/**
 * subject 기준 하드필터. 자기 자신·상태·성별·나이 상호·지역·dealBreaker·기판정을 걸러낸다.
 *
 * 경계(성별)만 확실히 막고 나머지는 fail-open이다. 풀이 수십 명뿐이라
 * 선호까지 하드필터로 올리면 후보가 0에 가까워진다.
 */
export function filterCandidates(
  subject: MatchProfileSlice,
  pool: MatchProfileSlice[],
  options: FilterOptions = {}
): MatchProfileSlice[] {
  return pool.filter((c) => {
    if (c.id === subject.id) return false;
    if (!CANDIDATE_STATUSES.has(c.status)) return false;
    if (options.excludeIds?.has(c.id)) return false;

    // 이성만 소개한다. 둘 다 알 때만 판단하고, 모르면 막지 않는다 —
    // 성별이 비어 있다고 그 프로필을 영영 안 보여주면 조용히 사라진다.
    if (subject.gender && c.gender && subject.gender === c.gender) return false;

    // subject가 원하는 상대 나이 ← candidate 출생연도
    if (!birthYearInRange(c.birthYear, subject.partnerBirthYearMin, subject.partnerBirthYearMax)) {
      return false;
    }
    // 상호: candidate가 원하는 나이 ← subject 출생연도
    if (!birthYearInRange(subject.birthYear, c.partnerBirthYearMin, c.partnerBirthYearMax)) {
      return false;
    }

    if (!regionCompatible(c.region, subject.partnerRegions)) return false;
    if (!regionCompatible(subject.region, c.partnerRegions)) return false;

    if (dealBreakerHit(subject.dealBreakers, summaryText(c))) return false;
    if (dealBreakerHit(c.dealBreakers, summaryText(subject))) return false;

    return true;
  });
}

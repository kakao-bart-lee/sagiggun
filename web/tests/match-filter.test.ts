import { describe, it, expect } from 'vitest';
import {
  birthYearInRange,
  regionCompatible,
  dealBreakerHit,
  filterCandidates,
  type MatchProfileSlice,
} from '@/lib/match/filter';

function profile(partial: Partial<MatchProfileSlice> & { id: string }): MatchProfileSlice {
  return {
    sourceHandle: partial.sourceHandle ?? partial.id,
    status: partial.status ?? 'PUBLISHED',
    gender: partial.gender ?? null,
    birthYear: partial.birthYear ?? null,
    region: partial.region ?? null,
    partnerBirthYearMin: partial.partnerBirthYearMin ?? null,
    partnerBirthYearMax: partial.partnerBirthYearMax ?? null,
    partnerRegions: partial.partnerRegions ?? [],
    dealBreakers: partial.dealBreakers ?? [],
    idealType: partial.idealType ?? [],
    hobbies: partial.hobbies ?? [],
    appealPoints: partial.appealPoints ?? [],
    job: partial.job ?? null,
    heightCm: partial.heightCm ?? null,
    ...partial,
  };
}

describe('birthYearInRange', () => {
  it('구간이 없으면 통과', () => {
    expect(birthYearInRange(1990, null, null)).toBe(true);
  });
  it('구간 밖이면 탈락', () => {
    expect(birthYearInRange(1980, 1990, 2000)).toBe(false);
    expect(birthYearInRange(2005, 1990, 2000)).toBe(false);
  });
  it('출생연도 없으면 통과', () => {
    expect(birthYearInRange(null, 1990, 2000)).toBe(true);
  });
});

describe('regionCompatible', () => {
  it('선호 지역 없으면 통과', () => {
    expect(regionCompatible('서울', [])).toBe(true);
  });
  it('부분 문자열 매칭', () => {
    expect(regionCompatible('서울 강남', ['서울'])).toBe(true);
    expect(regionCompatible('부산', ['서울'])).toBe(false);
  });
});

describe('dealBreakerHit', () => {
  it('키워드가 있으면 true', () => {
    expect(dealBreakerHit(['흡연'], '취미 흡연 중')).toBe(true);
    expect(dealBreakerHit(['흡연'], '운동 좋아함')).toBe(false);
  });
});

describe('filterCandidates', () => {
  it('자기 자신과 ARCHIVED를 제외한다', () => {
    const subject = profile({
      id: 's',
      birthYear: 1995,
      partnerBirthYearMin: 1990,
      partnerBirthYearMax: 2000,
    });
    const pool = [
      subject,
      profile({ id: 'a', status: 'ARCHIVED', birthYear: 1995 }),
      profile({ id: 'ok', status: 'APPROVED', birthYear: 1995 }),
      profile({ id: 'pub', status: 'PUBLISHED', birthYear: 1995 }),
      profile({ id: 'old', status: 'PUBLISHED', birthYear: 1980 }),
    ];
    const ids = filterCandidates(subject, pool).map((p) => p.id);
    expect(ids).toEqual(['ok', 'pub']);
  });

  it('상호 나이 조건을 적용한다', () => {
    const subject = profile({
      id: 's',
      birthYear: 1995,
      partnerBirthYearMin: 1990,
      partnerBirthYearMax: 2000,
    });
    const picky = profile({
      id: 'picky',
      birthYear: 1995,
      partnerBirthYearMin: 2000,
      partnerBirthYearMax: 2005,
    });
    expect(filterCandidates(subject, [picky])).toEqual([]);
  });
});

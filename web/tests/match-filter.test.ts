import { describe, it, expect } from 'vitest';
import {
  birthYearInRange,
  dealBreakerHit,
  filterCandidates,
  type MatchProfileSlice,
} from '@/lib/match/filter';
import { scoreDirection } from '@/lib/match/score';

function profile(partial: Partial<MatchProfileSlice> & { id: string }): MatchProfileSlice {
  return {
    seq: partial.seq ?? null,
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
    faceType: partial.faceType ?? null,
    partnerFaceTypes: partial.partnerFaceTypes ?? [],
    partnerHeightMin: partial.partnerHeightMin ?? null,
    partnerHeightMax: partial.partnerHeightMax ?? null,
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

  it('같은 성별은 제외한다', () => {
    const subject = profile({ id: 's', gender: 'M', birthYear: 1995 });
    const pool = [
      profile({ id: 'same', gender: 'M', birthYear: 1995 }),
      profile({ id: 'other', gender: 'F', birthYear: 1995 }),
    ];
    expect(filterCandidates(subject, pool).map((p) => p.id)).toEqual(['other']);
  });

  it('성별을 모르면 막지 않는다 — 아는 두 값이 같을 때만 탈락시킨다', () => {
    const subject = profile({ id: 's', gender: 'M', birthYear: 1995 });
    const unknown = profile({ id: 'u', gender: null, birthYear: 1995 });
    expect(filterCandidates(subject, [unknown]).map((p) => p.id)).toEqual(['u']);

    const noGenderSubject = profile({ id: 's2', gender: null, birthYear: 1995 });
    const male = profile({ id: 'm', gender: 'M', birthYear: 1995 });
    expect(filterCandidates(noGenderSubject, [male]).map((p) => p.id)).toEqual(['m']);
  });

  it('이미 판정한 짝은 다시 올리지 않는다', () => {
    const subject = profile({ id: 's', gender: 'M', birthYear: 1995 });
    const pool = [
      profile({ id: 'judged', gender: 'F', birthYear: 1995 }),
      profile({ id: 'fresh', gender: 'F', birthYear: 1995 }),
    ];
    const ids = filterCandidates(subject, pool, {
      excludeIds: new Set(['judged']),
    }).map((p) => p.id);
    expect(ids).toEqual(['fresh']);
  });

  it('나이가 구간을 2년까지 벗어나도 통과시킨다 — 아슬아슬한 차이로 죽이지 않는다', () => {
    // 실데이터에서 나이로 탈락한 쌍 1008개 중 520개가 2년 이내 차이였다.
    const subject = profile({
      id: 's',
      gender: 'M',
      birthYear: 1995,
      partnerBirthYearMin: 1996,
      partnerBirthYearMax: 2006,
    });
    const twoYearsOff = profile({
      id: 'near',
      gender: 'F',
      birthYear: 2001,
      partnerBirthYearMin: 1997, // subject(1995)가 2년 모자란다
      partnerBirthYearMax: 2006,
    });
    expect(filterCandidates(subject, [twoYearsOff]).map((p) => p.id)).toEqual(['near']);
  });

  it('3년을 넘으면 여전히 탈락시킨다', () => {
    const subject = profile({ id: 's', gender: 'M', birthYear: 1995 });
    const tooFar = profile({
      id: 'far',
      gender: 'F',
      birthYear: 2001,
      partnerBirthYearMin: 1999, // subject가 4년 모자란다
      partnerBirthYearMax: 2006,
    });
    expect(filterCandidates(subject, [tooFar])).toEqual([]);
  });

  it('여유는 게이트에만 준다 — 점수는 그대로 깎인다', () => {
    const me = profile({ id: 'me', partnerBirthYearMin: 1996, partnerBirthYearMax: 2006 });
    const oneYearOff = profile({ id: 'you', birthYear: 1995 });
    const age = scoreDirection(me, oneYearOff).parts.find((p) => p.dim === '나이')!;
    expect(age.state).toBe('miss');
    expect(age.score).toBeCloseTo(1 - 1 / 6, 5);
  });

  it('지역이 어긋나도 탈락시키지 않는다 — 경계가 아니라 선호다', () => {
    // 부산 남성과 서울 여성. 서로의 희망 지역에 안 맞지만 후보로는 남아야 한다.
    // 하드필터로 두면 지방 신청자가 수도권 전원에게서 전멸한다(점수에서 깎으면 된다).
    const busan = profile({
      id: 'busan',
      gender: 'M',
      birthYear: 1994,
      region: '부산 해운대',
      partnerRegions: ['부산', '경남'],
    });
    const seoul = profile({
      id: 'seoul',
      gender: 'F',
      birthYear: 1998,
      region: '서울 강남',
      partnerRegions: ['서울'],
    });
    expect(filterCandidates(busan, [seoul]).map((p) => p.id)).toEqual(['seoul']);
  });

  it('제외 목록을 안 주면 아무것도 더 막지 않는다', () => {
    const subject = profile({ id: 's', gender: 'M', birthYear: 1995 });
    const pool = [profile({ id: 'a', gender: 'F', birthYear: 1995 })];
    expect(filterCandidates(subject, pool).map((p) => p.id)).toEqual(['a']);
  });
});

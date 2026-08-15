import { describe, it, expect } from 'vitest';
import { scoreDirection, harmonic, scorePair, type ScoreSlice } from '@/lib/match/score';

function p(extra: Partial<ScoreSlice> = {}): ScoreSlice {
  return {
    id: 'x',
    seq: null,
    sourceHandle: 'x',
    status: 'PUBLISHED',
    gender: null,
    birthYear: 1995,
    region: null,
    heightCm: null,
    job: null,
    hobbies: [],
    appealPoints: [],
    idealType: [],
    partnerBirthYearMin: null,
    partnerBirthYearMax: null,
    partnerRegions: [],
    dealBreakers: [],
    ...extra,
  };
}

const dim = (d: ReturnType<typeof scoreDirection>, name: string) =>
  d.parts.find((x) => x.dim === name)!;

describe('scoreDirection', () => {
  it('나이가 구간 안이면 만점이다', () => {
    const me = p({ partnerBirthYearMin: 1990, partnerBirthYearMax: 2000 });
    const other = p({ birthYear: 1995 });
    expect(dim(scoreDirection(me, other), '나이')).toMatchObject({ score: 1, state: 'match' });
  });

  it('나이가 벗어나면 벗어난 만큼만 깎는다 — 0으로 떨어뜨리지 않는다', () => {
    const me = p({ partnerBirthYearMin: 1990, partnerBirthYearMax: 2000 });
    const other = p({ birthYear: 2003 }); // 3년 초과
    const age = dim(scoreDirection(me, other), '나이');
    expect(age.state).toBe('miss');
    expect(age.score).toBeCloseTo(0.5, 5); // 1 - 3/6
  });

  it('조건을 안 적었으면 중립이고 미상으로 표시한다', () => {
    const me = p({ partnerBirthYearMin: null, partnerBirthYearMax: null });
    const age = dim(scoreDirection(me, p({ birthYear: 1995 })), '나이');
    expect(age.state).toBe('unknown');
    expect(age.score).toBe(0.6);
  });

  it('상대의 값을 모르면 미상이다 — 맞는다고 보지 않는다', () => {
    const me = p({ partnerRegions: ['서울'] });
    const other = p({ region: null });
    expect(dim(scoreDirection(me, other), '지역').state).toBe('unknown');
  });

  it('지역이 겹치면 만점, 어긋나면 크게 깎는다', () => {
    const me = p({ partnerRegions: ['서울'] });
    expect(dim(scoreDirection(me, p({ region: '서울 강남' })), '지역').score).toBe(1);
    expect(dim(scoreDirection(me, p({ region: '부산' })), '지역').score).toBeLessThan(0.3);
  });

  it('키·얼굴상 필드가 아직 없으면 미상으로 둔다', () => {
    const d = scoreDirection(p(), p());
    expect(dim(d, '키').state).toBe('unknown');
    expect(dim(d, '얼굴상').state).toBe('unknown');
  });

  it('키 조건이 들어오면 바로 채점한다', () => {
    const me = p({ partnerHeightMin: 175, partnerHeightMax: null });
    expect(dim(scoreDirection(me, p({ heightCm: 180 })), '키')).toMatchObject({
      score: 1,
      state: 'match',
    });
    const short = dim(scoreDirection(me, p({ heightCm: 169 })), '키');
    expect(short.state).toBe('miss');
    expect(short.score).toBeCloseTo(0.5, 5); // 1 - 6/12
  });

  it('원하는 얼굴상과 겹치면 만점이다', () => {
    const me = p({ partnerFaceTypes: ['고양이상', '여우상'] });
    expect(dim(scoreDirection(me, p({ faceType: '고양이상' })), '얼굴상').score).toBe(1);
    expect(dim(scoreDirection(me, p({ faceType: '곰상' })), '얼굴상').state).toBe('miss');
  });

  it('전부 맞으면 1.0이다', () => {
    const me = p({
      partnerBirthYearMin: 1990,
      partnerBirthYearMax: 2000,
      partnerHeightMin: 170,
      partnerHeightMax: null,
      partnerFaceTypes: ['고양이상'],
      partnerRegions: ['서울'],
    });
    const other = p({ birthYear: 1995, heightCm: 178, faceType: '고양이상', region: '서울' });
    expect(scoreDirection(me, other).score).toBeCloseTo(1, 5);
  });
});

describe('harmonic', () => {
  it('한쪽이 0이면 0이다 — 한쪽만 좋은 짝은 짝이 아니다', () => {
    expect(harmonic(0.9, 0)).toBe(0);
    expect(harmonic(0, 0.9)).toBe(0);
  });

  it('양쪽이 같으면 그 값 그대로다', () => {
    expect(harmonic(0.8, 0.8)).toBeCloseTo(0.8, 5);
  });

  it('비대칭을 산술평균보다 세게 깎는다', () => {
    const a = 0.9;
    const b = 0.1;
    expect(harmonic(a, b)).toBeCloseTo(0.18, 2);
    expect(harmonic(a, b)).toBeLessThan((a + b) / 2);
  });
});

describe('scorePair', () => {
  it('양방향을 각각 재고 조화평균으로 묶는다', () => {
    // 나만 상대를 원하고, 상대는 나를 원하지 않는 짝
    const me = p({ id: 'me', birthYear: 1990, partnerBirthYearMin: 1994, partnerBirthYearMax: 1998 });
    const you = p({ id: 'you', birthYear: 1996, partnerBirthYearMin: 1996, partnerBirthYearMax: 2000 });

    const r = scorePair(me, you);
    expect(r.mine).toBeGreaterThan(r.theirs); // 내 조건엔 맞는데
    expect(r.harmonic).toBeLessThan(r.mine); // 짝 점수는 낮은 쪽으로 끌려간다
    expect(r.harmonic).toBeLessThan((r.mine + r.theirs) / 2);
  });

  it('방향을 바꿔도 짝 점수는 같다', () => {
    const a = p({ id: 'a', birthYear: 1993, partnerBirthYearMin: 1995, partnerBirthYearMax: 1999 });
    const b = p({ id: 'b', birthYear: 1997, partnerBirthYearMin: 1990, partnerBirthYearMax: 1994 });
    expect(scorePair(a, b).harmonic).toBeCloseTo(scorePair(b, a).harmonic, 10);
  });
});

import { describe, it, expect } from 'vitest';
import type { MatchProfileSlice } from '@/lib/match/filter';
import { listCandidatesFor } from '@/lib/match/candidates';

function slice(id: string, extra: Partial<MatchProfileSlice> = {}): MatchProfileSlice {
  return {
    id,
    seq: null,
    sourceHandle: id,
    status: 'PUBLISHED',
    gender: null,
    birthYear: 1995,
    region: '서울',
    partnerBirthYearMin: null,
    partnerBirthYearMax: null,
    partnerRegions: [],
    dealBreakers: [],
    idealType: [],
    hobbies: [],
    appealPoints: [],
    job: null,
    heightCm: null,
    ...extra,
  };
}

describe('listCandidatesFor', () => {
  const deps = (subject: MatchProfileSlice, pool: MatchProfileSlice[]) => ({
    findSubject: async () => subject,
    listPool: async () => pool,
    listJudged: async () => [] as string[],
  });

  it('없는 프로필이면 null', async () => {
    const r = await listCandidatesFor('nope', {
      findSubject: async () => null,
      listPool: async () => [],
      listJudged: async () => [],
    });
    expect(r).toBeNull();
  });

  it('양방향 점수와 차원별 판정을 함께 준다', async () => {
    const subject = slice('s', { gender: 'M', partnerRegions: ['서울'] });
    const c = slice('c', { gender: 'F', region: '서울' });
    const r = await listCandidatesFor('s', deps(subject, [c]));

    expect(r!.candidates).toHaveLength(1);
    const [first] = r!.candidates;
    expect(first.mine).toBeGreaterThan(0);
    expect(first.theirs).toBeGreaterThan(0);
    expect(first.harmonic).toBeLessThanOrEqual(Math.max(first.mine, first.theirs));
    expect(first.mineParts.map((p) => p.dim)).toEqual(['나이', '키', '얼굴상', '지역']);
    expect(first.theirParts).toHaveLength(4);
  });

  it('짝 점수가 높은 순으로 준다', async () => {
    const subject = slice('s', { gender: 'M', region: '서울', partnerRegions: ['서울'] });
    const good = slice('good', { gender: 'F', region: '서울', partnerRegions: ['서울'] });
    const poor = slice('poor', { gender: 'F', region: '서울', partnerRegions: [] });
    const r = await listCandidatesFor('s', deps(subject, [poor, good]));
    expect(r!.candidates.map((c) => c.id)).toEqual(['good', 'poor']);
  });

  it('하드필터를 그대로 적용한다 — 동성과 기판정은 빠진다', async () => {
    const subject = slice('s', { gender: 'M' });
    const pool = [
      slice('same', { gender: 'M' }),
      slice('judged', { gender: 'F' }),
      slice('ok', { gender: 'F' }),
    ];
    const r = await listCandidatesFor('s', {
      findSubject: async () => subject,
      listPool: async () => pool,
      listJudged: async () => ['judged'],
    });
    expect(r!.candidates.map((c) => c.id)).toEqual(['ok']);
  });

  it('LLM에 넘기는 상한(8명)에 걸리지 않고 통과한 전원을 준다', async () => {
    const subject = slice('s', { gender: 'M' });
    const pool = Array.from({ length: 12 }, (_, i) => slice(`c${i}`, { gender: 'F' }));
    const r = await listCandidatesFor('s', deps(subject, pool));
    expect(r!.candidates).toHaveLength(12);
  });
});

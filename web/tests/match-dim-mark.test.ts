import { describe, it, expect } from 'vitest';
import { dimMark, REAL_MISS, type DimScore } from '@/lib/match/score';

const part = (state: DimScore['state'], score: number): DimScore => ({
  dim: '키',
  state,
  score,
  want: '165cm 이하',
  has: '166cm',
});

describe('dimMark', () => {
  it('충족은 match', () => {
    expect(dimMark(part('match', 1))).toBe('match');
  });

  it('모르면 unknown', () => {
    expect(dimMark(part('unknown', 0.6))).toBe('unknown');
  });

  it('아슬아슬하게 벗어난 것은 near — 1cm 차이를 조건 위반과 같이 찍지 않는다', () => {
    // 165cm 이하를 찾는데 166cm. 12cm에 걸쳐 감쇠하므로 1 - 1/12 = 0.917
    expect(dimMark(part('miss', 1 - 1 / 12))).toBe('near');
  });

  it('경계값은 near에 넣는다', () => {
    expect(dimMark(part('miss', REAL_MISS))).toBe('near');
  });

  it('정말 안 맞으면 miss — 원하는 얼굴상과 교집합 없음(0.25)', () => {
    expect(dimMark(part('miss', 0.25))).toBe('miss');
  });

  it('near는 「안 맞는 조건」에 세지 않는다 — 화면의 ✕ 개수와 숫자가 어긋나면 안 된다', () => {
    const parts = [
      part('match', 1),
      part('miss', 1 - 1 / 12), // 키 1cm
      part('miss', 1 - 1 / 6), // 나이 1년
      part('miss', 0.25), // 얼굴상
    ];
    expect(parts.filter((p) => dimMark(p) === 'miss')).toHaveLength(1);
  });
});

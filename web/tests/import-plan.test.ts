import { describe, it, expect } from 'vitest';
import { planImport, syntheticHandle } from '@/lib/profile/import-plan';

const row = (seq: number) => ({ seq, sourceHandle: syntheticHandle(seq) });

describe('planImport', () => {
  it('빈 DB면 전부 새로 넣는다', () => {
    const plan = planImport([row(1), row(2)], []);
    expect(plan.create.map((r) => r.seq)).toEqual([1, 2]);
    expect(plan.update).toEqual([]);
    expect(plan.conflict).toEqual([]);
  });

  it('같은 번호를 우리가 이미 넣어둔 것이면 갱신한다 — 두 번 돌려도 안전해야 한다', () => {
    const plan = planImport([row(1)], [{ seq: 1, sourceHandle: 'someuslove-1' }]);
    expect(plan.update.map((r) => r.seq)).toEqual([1]);
    expect(plan.create).toEqual([]);
  });

  it('남의 번호면 건드리지 않고 충돌로 보고한다', () => {
    const plan = planImport([row(7)], [{ seq: 7, sourceHandle: 'real_person' }]);
    expect(plan.conflict).toEqual([{ seq: 7, sourceHandle: 'real_person' }]);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
  });

  it('번호 없는 기존 행은 계획에 아예 안 들어온다 — 지우지도, 덮지도 않는다', () => {
    const existing = [
      { seq: null, sourceHandle: 'jxxng_xnn' },
      { seq: null, sourceHandle: 'babyorangeeagles' },
    ];
    const plan = planImport([row(1)], existing);
    expect(plan.create.map((r) => r.seq)).toEqual([1]);
    expect(plan.update).toEqual([]);
    expect(plan.conflict).toEqual([]);
  });

  it('계획에 삭제는 없다 — 들여올 목록에 없는 기존 행은 언급조차 하지 않는다', () => {
    const plan = planImport([row(1)], [{ seq: 99, sourceHandle: 'someuslove-99' }]);
    expect(Object.keys(plan).sort()).toEqual(['conflict', 'create', 'update']);
    expect(plan.create.map((r) => r.seq)).toEqual([1]);
  });

  it('섞여 있으면 각각 제 갈래로 간다', () => {
    const plan = planImport(
      [row(1), row(2), row(3)],
      [
        { seq: 2, sourceHandle: 'someuslove-2' },
        { seq: 3, sourceHandle: 'someone_else' },
      ]
    );
    expect(plan.create.map((r) => r.seq)).toEqual([1]);
    expect(plan.update.map((r) => r.seq)).toEqual([2]);
    expect(plan.conflict.map((c) => c.seq)).toEqual([3]);
  });
});

describe('syntheticHandle', () => {
  it('실제 계정으로 오인되지 않을 값이어야 한다', () => {
    expect(syntheticHandle(12)).toBe('someuslove-12');
  });
});

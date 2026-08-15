/**
 * 게시 프로필을 DB에 들일 때 무엇을 만들고 무엇을 갱신할지 정한다.
 *
 * 원래 이 작업은 Profile을 전부 지우고 다시 넣었다(`--fresh`). 운영에는
 * 신청서로 들어온 사람이 이미 있어서 그 방식을 쓸 수 없다. 삭제는 계획에
 * 아예 없고, 남의 번호는 건드리지 않고 충돌로 보고한다.
 *
 * 키는 `seq`다 — 스키마에서 unique인 건 그것뿐이고(`sourceHandle`은 인덱스만
 * 있다), 게시번호는 사람과 1:1이라 두 번 돌려도 같은 결과가 나온다.
 */

/** 원본에 핸들이 없다. 실제 계정으로 오인되지 않을 합성 값을 쓴다. */
export function syntheticHandle(seq: number): string {
  return `someuslove-${seq}`;
}

type Keyed = { seq: number };
type Existing = { seq: number | null; sourceHandle: string };

export type ImportPlan<T extends Keyed> = {
  create: T[];
  update: T[];
  /** 그 번호를 우리가 넣지 않은 행이 이미 쓰고 있다. 덮지 않는다. */
  conflict: { seq: number; sourceHandle: string }[];
};

export function planImport<T extends Keyed>(
  rows: readonly T[],
  existing: readonly Existing[]
): ImportPlan<T> {
  const bySeq = new Map<number, string>();
  for (const e of existing) {
    if (e.seq != null) bySeq.set(e.seq, e.sourceHandle);
  }

  const plan: ImportPlan<T> = { create: [], update: [], conflict: [] };
  for (const r of rows) {
    const holder = bySeq.get(r.seq);
    if (holder === undefined) plan.create.push(r);
    else if (holder === syntheticHandle(r.seq)) plan.update.push(r);
    else plan.conflict.push({ seq: r.seq, sourceHandle: holder });
  }
  return plan;
}

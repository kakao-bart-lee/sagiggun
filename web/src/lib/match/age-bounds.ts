export type AgeBounds = { min: number | null; max: number | null };

/**
 * 「위로 2살, 아래로 3살」 같은 상대적 나이 표현을 절대 출생연도 구간으로 바꾼다.
 *
 * 년생은 작을수록 연상이므로 방향이 뒤집힌다:
 *   min = 허용하는 가장 이른 출생연도(= 가장 연상)
 *   max = 허용하는 가장 늦은 출생연도(= 가장 연하)
 *
 * 읽어내지 못한 문장은 null로 둔다 — 추측하지 않는다.
 */

// 「95년생 ~ 02년생」 · 「92~97년생」. 앞쪽 년생은 생략되기도 한다.
const RANGE = /(\d{2,4})\s*(?:년생)?\s*[~-]\s*(\d{2,4})\s*년생/;
// 「95년생까지」 — 범위 없이 하나만. 연상 한계를 말한다.
const UNTIL_YEAR = /(\d{2,4})\s*년생\s*까지/;
// 조사 「는」이 붙기도 하고(「아래로는 5살」), 한쪽에 범위를 적기도 한다(「아래로 2~5살」).
// 범위면 넓은 쪽(뒤 숫자)이 한계다.
const UP = /위로(?:는)?\s*(?:\d+\s*[~-]\s*)?(\d+)\s*살/; // 연상 N살까지
const DOWN = /아래로(?:는)?\s*(?:\d+\s*[~-]\s*)?(\d+)\s*살/; // 연하 N살까지
// 「위아래 4살」 · 「위, 아래 5살」 · 「위, 아래로 3살」
const SYMMETRIC = /위\s*,?\s*아래(?:로)?\s*(\d+)\s*살/;
const SAME_AGE = /동갑/;

/** 두 자리 연도를 편다. 신청자는 성인이라 00~30은 2000년대로 본다. */
function toYear(n: number): number {
  if (n >= 1000) return n;
  return n <= 30 ? 2000 + n : 1900 + n;
}

export function parseAgeBounds(
  raw: readonly string[] | null | undefined,
  birthYear: number
): AgeBounds {
  let min: number | null = null;
  let max: number | null = null;

  for (const line of raw ?? []) {
    const range = RANGE.exec(line);
    if (range) {
      const a = toYear(Number(range[1]));
      const b = toYear(Number(range[2]));
      // 「07년생 ~ 98년생」처럼 거꾸로 적는 사람이 있다
      min = Math.min(a, b);
      max = Math.max(a, b);
      continue;
    }

    const until = UNTIL_YEAR.exec(line);
    if (until) {
      min = toYear(Number(until[1]));
      continue;
    }

    const up = UP.exec(line);
    const down = DOWN.exec(line);
    if (up) min = birthYear - Number(up[1]);
    if (down) max = birthYear + Number(down[1]);

    if (!up && !down) {
      const both = SYMMETRIC.exec(line);
      if (both) {
        min = birthYear - Number(both[1]);
        max = birthYear + Number(both[1]);
      }
    }

    // 「동갑이나 아래로 3살까지」 — 연상 쪽 한계가 본인이다
    if (min === null && SAME_AGE.test(line)) min = birthYear;
  }

  return { min, max };
}

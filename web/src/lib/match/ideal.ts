export type HeightBounds = { min: number | null; max: number | null };

/**
 * 이상형 문장에서 구조화할 수 있는 두 가지를 뽑는다.
 * 실데이터 69건 기준 키는 88%, 얼굴상은 51%가 이 형태로 적혀 있다.
 * 읽어내지 못하면 비워 둔다 — 추측하지 않는다.
 */

// 키는 세 자리(120~230)로 적힌다. 「1994년생」 같은 네 자리를 집지 않도록 경계를 둔다.
const H = String.raw`(?<!\d)(1[2-9]\d|2[0-2]\d)(?!\d)`;
const RANGE = new RegExp(`${H}\\s*(?:cm)?\\s*[~-]\\s*${H}\\s*(?:cm)?`);
const AT_LEAST = new RegExp(`${H}\\s*(?:cm)?\\s*이상`);
const AT_MOST = new RegExp(`${H}\\s*(?:cm)?\\s*이하`);

export function parseHeightBounds(idealType: readonly string[]): HeightBounds {
  for (const line of idealType) {
    const range = RANGE.exec(line);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
    const lo = AT_LEAST.exec(line);
    if (lo) return { min: Number(lo[1]), max: null };
    const hi = AT_MOST.exec(line);
    if (hi) return { min: null, max: Number(hi[1]) };
  }
  return { min: null, max: null };
}

/** 어휘가 닫혀 있다 — 새로운 「○○상」이 나오면 여기에 더한다. */
const FACES = [
  '강아지',
  '고양이',
  '여우',
  '토끼',
  '곰',
  '사슴',
  '햄스터',
  '햄찌',
  '두부',
  '늑대',
  '말',
  '공룡',
  '다람쥐',
  '원숭이',
] as const;

const ALT = FACES.join('|');
/**
 * 「고양이상」처럼 곧바로 상이 붙거나, 「강아지, 두부상」처럼 쉼표로 이어 적고
 * 마지막에만 상을 붙이는 경우를 잡는다. 「말투」가 「말상」으로 잡히지 않게
 * 뒤에 상이나 다음 얼굴상 어휘가 와야만 인정한다.
 */
const FACE_RE = new RegExp(`(${ALT})(?=상|\\s*[,·]\\s*(?:${ALT}))`, 'g');

export function parseFaceTypes(idealType: readonly string[]): string[] {
  const found: string[] = [];
  for (const line of idealType) {
    for (const m of line.matchAll(FACE_RE)) {
      const name = `${m[1]}상`;
      if (!found.includes(name)) found.push(name);
    }
  }
  return found;
}

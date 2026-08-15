/**
 * 지역 문자열 → 광역 코드.
 *
 * 신청서의 지역란은 자유 서술이다. 「대구」, 「경기 남부」, 「수도권 선호해요!」,
 * 「경상도권 여성분 선호합니다.」가 모두 같은 칸에 들어온다. 이걸 부분문자열로
 * 비교하면 대구와 경상도가 남남이 되고, 실제로 실데이터 지역 판정의 80%가
 * 그렇게 ✕로 떨어졌다. 양쪽을 같은 코드 집합으로 바꾼 뒤 교집합으로 본다.
 */

export const REGION_CODES = [
  '서울',
  '경기',
  '인천',
  '강원',
  '충북',
  '충남',
  '대전',
  '세종',
  '전북',
  '전남',
  '광주',
  '경북',
  '경남',
  '대구',
  '울산',
  '부산',
  '제주',
] as const;

export type RegionCode = (typeof REGION_CODES)[number];

const 경상: RegionCode[] = ['경북', '경남', '대구', '울산', '부산'];
const 충청: RegionCode[] = ['충북', '충남', '대전', '세종'];
const 전라: RegionCode[] = ['전북', '전남', '광주'];

/**
 * 찾을 표현 → 코드. 긴 표현부터 먼저 집어가므로 「경상남도」는 「경상」보다 앞선다.
 * 시·군은 실데이터에 나온 것과 오해의 소지가 없는 큰 도시만 넣었다
 * (「고양」은 고양이와 부딪혀서 뺐다).
 */
const ALIASES: Record<string, RegionCode[]> = {
  경상남도: ['경남'],
  경상북도: ['경북'],
  충청남도: ['충남'],
  충청북도: ['충북'],
  전라남도: ['전남'],
  전라북도: ['전북'],
  경기도: ['경기'],
  강원도: ['강원'],
  제주도: ['제주'],

  수도권: ['서울', '경기', '인천'],
  경상: 경상,
  영남: 경상,
  충청: 충청,
  전라: 전라,
  호남: 전라,

  서울: ['서울'],
  경기: ['경기'],
  인천: ['인천'],
  강원: ['강원'],
  충북: ['충북'],
  충남: ['충남'],
  대전: ['대전'],
  세종: ['세종'],
  전북: ['전북'],
  전남: ['전남'],
  광주: ['광주'],
  경북: ['경북'],
  경남: ['경남'],
  대구: ['대구'],
  울산: ['울산'],
  부산: ['부산'],
  제주: ['제주'],

  성남: ['경기'],
  수원: ['경기'],
  안양: ['경기'],
  시흥: ['경기'],
  용인: ['경기'],
  평택: ['경기'],
  구리: ['경기'],
  부천: ['경기'],
  김포: ['경기'],
  안산: ['경기'],
  의정부: ['경기'],
  일산: ['경기'],
  분당: ['경기'],
  판교: ['경기'],
  송도: ['인천'],
  청주: ['충북'],
  천안: ['충남'],
  아산: ['충남'],
  원주: ['강원'],
  춘천: ['강원'],
  강릉: ['강원'],
  창원: ['경남'],
  김해: ['경남'],
  양산: ['경남'],
  포항: ['경북'],
  구미: ['경북'],
  경주: ['경북'],
  전주: ['전북'],
  서귀포: ['제주'],
};

/** 광역시는 떨어져 나온 도를 부모로 둔다. 대구를 원하는 사람과 경북 사람이 만나야 한다. */
const PARENT: Partial<Record<RegionCode, RegionCode>> = {
  대구: '경북',
  부산: '경남',
  울산: '경남',
  광주: '전남',
  대전: '충남',
  세종: '충남',
  인천: '경기',
};

/** 긴 표현이 먼저 걸리도록 정렬해 둔다. 「경상남도」가 「경상」에 먹히면 안 된다. */
const ALIAS_ENTRIES = Object.entries(ALIASES).sort((a, b) => b[0].length - a[0].length);

/**
 * 자유 서술에서 광역 코드를 뽑는다.
 *
 * 앞이 한글이면 건너뛴다 — 「대전남부」에서 「전남」을 읽어내는 사고를 막는다.
 * 한 번 집은 자리는 지우고 넘어가므로 짧은 표현이 긴 표현 안에서 또 걸리지 않는다.
 */
export function regionTags(text: string | null | undefined): RegionCode[] {
  if (!text?.trim()) return [];

  let rest = text;
  const found = new Set<RegionCode>();

  for (const [alias, codes] of ALIAS_ENTRIES) {
    const re = new RegExp(`(?<![가-힣])${alias}`, 'g');
    if (!re.test(rest)) continue;
    for (const c of codes) found.add(c);
    rest = rest.replace(new RegExp(`(?<![가-힣])${alias}`, 'g'), '·');
  }

  for (const code of [...found]) {
    const parent = PARENT[code];
    if (parent) found.add(parent);
  }

  return REGION_CODES.filter((c) => found.has(c));
}

/** 여러 칸을 한 번에 태그로 바꾼다. */
export function regionTagsOf(texts: readonly (string | null | undefined)[]): RegionCode[] {
  const found = new Set<RegionCode>();
  for (const t of texts) for (const c of regionTags(t)) found.add(c);
  return REGION_CODES.filter((c) => found.has(c));
}

/** 「어디든 좋다」는 지명이 없는 게 아니라 전부를 고른 것이다. */
const ANYWHERE = /장거리|상관\s*없|관계\s*없|어디든|어디라도|전국|상관무/;

/**
 * 사는 곳과 원하는 곳이 겹치는가.
 *
 * 어느 쪽이든 「어디든 좋다」고 적었으면 맞는다 — 가장 유연한 사람이
 * 미상으로 떨어져 매번 0.6으로 깎이면, 조건을 좁게 적은 사람보다 손해를 본다.
 * 그게 아니라 정말 지명을 못 읽어냈으면 null이다(예: 「미국」).
 */
export function regionsOverlap(
  mine: readonly (string | null | undefined)[],
  wanted: readonly (string | null | undefined)[]
): boolean | null {
  if ([...mine, ...wanted].some((t) => t && ANYWHERE.test(t))) return true;
  const a = regionTagsOf(mine);
  const b = regionTagsOf(wanted);
  if (a.length === 0 || b.length === 0) return null;
  return a.some((c) => b.includes(c));
}

/** 묶음이 다 차면 묶음 이름으로 줄여 보여준다. 다섯 개를 늘어놓을 이유가 없다. */
const GROUPS: [string, RegionCode[]][] = [
  ['수도권', ['서울', '경기', '인천']],
  ['충청', 충청],
  ['전라', 전라],
  ['경상', 경상],
];

/** 화면에 쓸 짧은 이름. 「경상도권 여성분 선호합니다.」 → 「경상」 */
export function regionLabel(texts: readonly (string | null | undefined)[]): string | null {
  const tags = new Set(regionTagsOf(texts));
  if (tags.size === 0) {
    return texts.some((t) => t && ANYWHERE.test(t)) ? '어디든' : null;
  }

  const parts: string[] = [];
  for (const [name, codes] of GROUPS) {
    if (!codes.every((c) => tags.has(c))) continue;
    parts.push(name);
    for (const c of codes) tags.delete(c);
  }
  parts.push(...REGION_CODES.filter((c) => tags.has(c)));
  return parts.join('·');
}

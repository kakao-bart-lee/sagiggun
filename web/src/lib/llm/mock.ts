import type { Extracted } from './extract';
import type { MatchRankItem } from './match';
import type { MatchProfileSlice } from '@/lib/match/filter';

/** 원문 키워드를 조금 읽어 결정적 추출 결과를 만든다 (LLM_MODE=mock). */
export function mockExtract(rawText: string): Extracted {
  const gender = /남성|남\b|남자/.test(rawText) ? 'M' : /여성|여\b|여자/.test(rawText) ? 'F' : 'F';
  const yearMatch = rawText.match(/((?:19|20)\d{2})\s*년|\b(\d{2})\s*년생/);
  let birthYear: number | null = null;
  if (yearMatch?.[1]) birthYear = Number(yearMatch[1]);
  else if (yearMatch?.[2]) {
    const yy = Number(yearMatch[2]);
    birthYear = yy >= 50 ? 1900 + yy : 2000 + yy;
  } else {
    birthYear = gender === 'F' ? 1998 : 1995;
  }

  const region =
    rawText.match(
      /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[^\s,]{0,6}/
    )?.[0] ?? '서울';

  const height = rawText.match(/(\d{3})\s*cm/i)?.[1];
  const job =
    rawText.match(
      /(개발|디자이너|마케터|금융|교사|의사|간호사|자영업|회사원|프리랜서)[^\s,]{0,8}/
    )?.[0] ?? '회사원';

  return {
    gender,
    birthYear,
    region,
    heightCm: height ? Number(height) : gender === 'F' ? 165 : 178,
    job,
    hobbies: ['카페', '영화'],
    appealPoints: ['성실함', '대화 잘함', '배려'],
    idealType: ['바른 생활', '유머', '성실'],
    partnerBirthYearMin: birthYear ? birthYear - 5 : 1990,
    partnerBirthYearMax: birthYear ? birthYear + 5 : 2005,
    partnerRegions: [region.includes('서울') || region.includes('경기') ? '서울' : region],
    dealBreakers: ['흡연'],
  };
}

/** hasTemplateShape() REQUIRED_MARKERS를 모두 포함하는 mock 본문. */
export function mockCompose(fields: Extracted): string {
  const genderKo = fields.gender === 'M' ? '남성' : fields.gender === 'F' ? '여성' : '';
  const year = fields.birthYear ?? 1995;
  const yearRange =
    fields.partnerBirthYearMin && fields.partnerBirthYearMax
      ? `${String(fields.partnerBirthYearMin).slice(2)}년생~${String(fields.partnerBirthYearMax).slice(2)}년생`
      : '제한 없음';
  const hobbies = (fields.hobbies ?? []).join(' / ') || '카페';
  const appeals = fields.appealPoints?.length
    ? fields.appealPoints
    : ['성실함', '대화 잘함', '배려'];
  const ideals = fields.idealType?.length ? fields.idealType : ['바른 생활', '유머', '성실'];
  const deals = (fields.dealBreakers ?? []).join('\n') || '흡연';

  return `✨ ${fields.region ?? '서울'}에 거주중인 ${year}년생 ${genderKo}분 입니다.
${fields.job ?? '회사원'}에서 근무중이신 ${fields.heightCm ?? 170}cm 단정한 인상 🙂
취미: ${hobbies}
사진처럼 맑고 밝은 인상입니다.
정돈된 분위기예요.
본인의 장점은 💖
1. ${appeals[0] ?? '성실함'}
2. ${appeals[1] ?? '대화 잘함'}
3. ${appeals[2] ?? '배려'}
이상형은 📌
1. ${ideals[0] ?? '바른 생활'}
2. ${ideals[1] ?? '유머'}
3. ${ideals[2] ?? '성실'}
✔️ ${yearRange} 가능해요!
✔️ ${(fields.partnerRegions ?? ['서울']).join(', ')} 가능해요!
❌이건 절대 안 돼요.
${deals}
📨 관심 있으신 분은 메세지 주세요!`;
}

export function mockRankMatches(
  subject: MatchProfileSlice,
  candidates: MatchProfileSlice[],
  topN: number
): MatchRankItem[] {
  return candidates.slice(0, topN).map((c, i) => ({
    candidateId: c.id,
    score: Math.max(0.5, 0.95 - i * 0.08),
    rationale: `@${subject.sourceHandle}와 @${c.sourceHandle}는 지역·나이 조건이 가깝습니다.`,
    draftForSubject: `안녕하세요 @${subject.sourceHandle}님, 매칭 안내입니다.\n상대: @${c.sourceHandle} (${c.region ?? '지역 미상'} · ${c.birthYear ?? '연도 미상'})\n관심 있으시면 답장 주세요.`,
    draftForCandidate: `안녕하세요 @${c.sourceHandle}님, 매칭 안내입니다.\n상대: @${subject.sourceHandle} (${subject.region ?? '지역 미상'} · ${subject.birthYear ?? '연도 미상'})\n관심 있으시면 답장 주세요.`,
  }));
}

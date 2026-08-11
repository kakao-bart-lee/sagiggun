// 관심 파이프라인 각 단계의 DM 문안 프리필.
// LLM이 아니라 코드 템플릿이다 — 운영자가 보내기 전에 언제나 수정할 수 있고,
// 없는 사실을 지어낼 여지가 없다. 보내기는 확장/운영자가 Threads에서 직접 한다.

type SpecSummarySource = {
  gender: string | null;
  birthYear: number | null;
  heightCm: number | null;
  region: string | null;
  job: string | null;
  hobbies: string[];
  appealPoints: string[];
};

function seqLabel(seq: number | null): string {
  return seq != null ? `${seq}번` : '해당';
}

/** 관심자에게 보내는 스펙 문의 — 수작업 때 확장 '문구'로 보내던 멘트의 표준형. */
export function specRequestBody(targetSeq: number | null): string {
  return `안녕하세요! ${seqLabel(targetSeq)} 프로필에 관심 주셔서 감사합니다 💗
상대분께 전달드릴 수 있게 아래 양식으로 본인 소개를 보내주세요!

🤍 본인 소개
- 사진 2장 이상
- 나이 / 성별 / 키
- 직업 / 취미
- 본인 어필 3가지
1.
2.
3.

✔️ 사진은 주인장만 확인하고, 상대분이 의향을 밝히면 전달됩니다.
✔️ 미성년자는 신청할 수 없습니다.`;
}

/** 성별 표기 — 추출 필드는 F/M로 저장된다. */
function genderLabel(gender: string | null): string | null {
  if (gender === 'F') return '여성';
  if (gender === 'M') return '남성';
  return null;
}

/**
 * 후보(관심 대상)에게 보내는 스펙 전달 + 의향 문의.
 * 관심자 프로필에서 추출된 사실만 요약한다 — 비어 있는 필드는 줄 자체를 뺀다.
 */
export function specForwardBody(targetSeq: number | null, from: SpecSummarySource): string {
  const facts: string[] = [];
  const basics = [
    from.birthYear != null ? `${String(from.birthYear).slice(-2)}년생` : null,
    genderLabel(from.gender),
    from.heightCm != null ? `${from.heightCm}cm` : null,
    from.region,
  ].filter(Boolean);
  if (basics.length) facts.push(`- ${basics.join(' / ')}`);
  if (from.job) facts.push(`- 직업: ${from.job}`);
  if (from.hobbies.length) facts.push(`- 취미: ${from.hobbies.join(', ')}`);
  if (from.appealPoints.length) {
    facts.push(`- 어필 포인트`);
    from.appealPoints.forEach((point, i) => facts.push(`  ${i + 1}. ${point}`));
  }

  return `안녕하세요! 올려드렸던 ${seqLabel(targetSeq)} 프로필에 관심을 보내신 분이 있어 소개 전달드려요 😊

${facts.length ? facts.join('\n') : '- (소개 내용을 여기에 붙여주세요)'}

사진은 이어서 보내드릴게요 📸
만나볼 의향 있으시면 편하게 답장 주세요!`;
}

/** 성사 — 양쪽에 서로의 핸들을 알려주는 안내. */
export function connectBody(counterpartHandle: string): string {
  return `축하드려요, 매칭이 성사됐습니다 🎉
상대분 스레드 계정은 @${counterpartHandle} 입니다.
먼저 정중하게 DM으로 인사 나눠보세요! 좋은 인연 되시길 바랍니다 💗`;
}

/** 후보가 거절했을 때 관심자에게 보내는 안내. */
export function declineBody(targetSeq: number | null): string {
  return `안녕하세요! 아쉽지만 ${seqLabel(targetSeq)} 분과는 인연이 닿지 않았어요 🙏
소개를 정성껏 보내주셔서 감사합니다.
다른 프로필도 계속 올라오니 관심 있으면 또 메세지 주세요!`;
}

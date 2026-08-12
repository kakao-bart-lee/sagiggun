// 게시 번호(`50.`)는 본문에 넣지 않는다. 게시 시점에 앞에 붙인다.
export const TEMPLATE = `✨ {거주지}에 거주중인 {출생연도}년생 {성별}분 입니다.
{직업}에서 근무중이신 {키}cm {인상} {이모지}

취미: {취미}

{사진 묘사 2~4줄 — 「사진 묘사」 규칙을 따릅니다}

본인의 장점은 💖
1. {장점}
2. {장점}
3. {장점}

이상형은 📌
1. {이상형}
2. {이상형}
3. {이상형}

✔️ {출생연도 범위} 가능해요!
✔️ {가능 지역} 가능해요!

❌이건 절대 안 돼요.
{데알브레이커}

📨 관심 있으신 분은 메세지 주세요!`;

export const REQUIRED_MARKERS = [
  '✨',
  '취미:',
  '본인의 장점은 💖',
  '이상형은 📌',
  '✔️',
  '❌이건 절대 안 돼요.',
  '📨 관심 있으신 분은 메세지 주세요!',
];

export function hasTemplateShape(body: string): boolean {
  if (!body.trimStart().startsWith('✨')) return false;
  return REQUIRED_MARKERS.every((marker) => body.includes(marker));
}

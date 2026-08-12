import { describe, it, expect, vi } from 'vitest';
import { TEMPLATE, REQUIRED_MARKERS, hasTemplateShape } from '@/lib/llm/template';
import { composeBody } from '@/lib/llm/compose';
import type { Extracted } from '@/lib/llm/extract';

const fields: Extracted = {
  gender: 'F',
  birthYear: 2002,
  region: '서울',
  heightCm: 163,
  job: '금융권',
  hobbies: ['워터파크'],
  appealPoints: ['무던하다'],
  idealType: ['175cm 이상'],
  partnerBirthYearMin: 1997,
  partnerBirthYearMax: 2004,
  partnerRegions: ['서울'],
  dealBreakers: ['이성문제'],
};

const goodBody = [
  '✨ 서울에 거주중인 2002년생 여성분 입니다.',
  '금융권에서 근무중이신 163cm 강아지상 🐾',
  '취미: 워터파크',
  '사진에서도 발랄함이 느껴지는 분이에요',
  '비율도 좋고 귀여운 인상이에요',
  '본인의 장점은 💖',
  '1. 무던하다',
  '이상형은 📌',
  '1. 175cm 이상',
  '✔️ 97년생~04년생 가능해요!',
  '✔️ 서울 가능해요!',
  '❌이건 절대 안 돼요.',
  '이성문제',
  '📨 관심 있으신 분은 메세지 주세요!',
].join('\n');

describe('TEMPLATE', () => {
  it('게시 번호를 포함하지 않는다', () => {
    expect(TEMPLATE).not.toMatch(/\{seq\}/);
    expect(TEMPLATE.trimStart().startsWith('✨')).toBe(true);
  });
});

describe('hasTemplateShape', () => {
  it('필수 표지가 모두 있으면 통과한다', () => {
    expect(hasTemplateShape(goodBody)).toBe(true);
  });

  it('표지가 하나라도 빠지면 실패한다', () => {
    for (const marker of REQUIRED_MARKERS) {
      expect(hasTemplateShape(goodBody.replaceAll(marker, ''))).toBe(false);
    }
  });

  it('번호가 앞에 붙으면 실패한다', () => {
    expect(hasTemplateShape(`50.\n${goodBody}`)).toBe(false);
  });
});

describe('composeBody', () => {
  const ok = () => ({ content: [{ type: 'text', text: goodBody }] });

  it('본문 텍스트를 돌려준다', async () => {
    const create = vi.fn(async () => ok());
    expect(await composeBody(fields, [], { create })).toBe(goodBody);
  });

  it('사진을 이미지 블록으로 함께 보낸다', async () => {
    const create = vi.fn(async (_args: unknown) => ok());
    await composeBody(fields, [{ contentType: 'image/png', base64: 'AAAA' }], { create });
    const args = create.mock.calls[0][0] as { messages: Array<{ content: unknown[] }> };
    const blocks = args.messages[0].content as Array<{ type: string }>;
    expect(blocks.some((b) => b.type === 'image')).toBe(true);
  });

  it('사진이 없어도 동작한다', async () => {
    const create = vi.fn(async () => ok());
    await expect(composeBody(fields, [], { create })).resolves.toBe(goodBody);
  });

  it('금지된 샘플링 파라미터를 보내지 않는다', async () => {
    const create = vi.fn(async (_args: unknown) => ok());
    await composeBody(fields, [], { create });
    const args = create.mock.calls[0][0] as Record<string, unknown>;
    expect(args.temperature).toBeUndefined();
    expect(args.top_p).toBeUndefined();
    expect(args.top_k).toBeUndefined();
    expect(args.thinking).toBeUndefined();
  });

  it('시스템 프롬프트에 실존 인물 관련 안전 지시가 유지된다', async () => {
    const create = vi.fn(async (_args: unknown) => ok());
    await composeBody(fields, [], { create });
    const args = create.mock.calls[0][0] as { system: string };
    const system = args.system;
    // 사진에서 유래한 내용은 「사진 묘사」 자리로만 제한된다 — 나머지 줄은 추출 항목이 결정한다.
    expect(system).toMatch(/사진을 보고 쓰는 부분은 「사진 묘사」 자리뿐/);
    expect(system).toMatch(/호의적/);
    expect(system).toMatch(/등급/);
    expect(system).toMatch(/성적으로/);
    expect(system).toMatch(/실존 인물/);
    expect(system).toMatch(/사람이 검수/);
  });

  it('사진 묘사를 생생하게 쓰도록 지시하고 건조한 문장을 실패로 규정한다', async () => {
    const create = vi.fn(async (_args: unknown) => ok());
    await composeBody(fields, [], { create });
    const { system } = create.mock.calls[0][0] as { system: string };
    // 피드백의 핵심: 스타일만 적은 문장("단정한 앞머리")은 이미지가 떠오르지 않는다.
    expect(system).toMatch(/단정한 앞머리/);
    expect(system).toMatch(/실패/);
    // 하우스 스타일의 주요 기법이 프롬프트에 남아 있어야 한다.
    expect(system).toMatch(/대비 구조/);
    expect(system).toMatch(/구어체/);
    expect(system).toMatch(/사진 묘사 예시/);
  });

  it('max_tokens를 넉넉히 잡는다', async () => {
    const create = vi.fn(async (_args: unknown) => ok());
    await composeBody(fields, [], { create });
    const args = create.mock.calls[0][0] as { max_tokens: number };
    expect(args.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it('형식이 어긋난 응답은 거부한다', async () => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: '아무 말' }] }));
    await expect(composeBody(fields, [], { create })).rejects.toThrow(/형식/);
  });

  it('텍스트 블록이 없으면 거부한다', async () => {
    const create = vi.fn(async () => ({ content: [] }));
    await expect(composeBody(fields, [], { create })).rejects.toThrow(/형식|비어/);
  });
});

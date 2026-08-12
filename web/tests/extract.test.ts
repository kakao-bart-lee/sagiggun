import { describe, it, expect, vi } from 'vitest';
import { ExtractedSchema, extractFields, EXTRACT_SYSTEM } from '@/lib/llm/extract';

const valid = {
  gender: 'F',
  birthYear: 2002,
  region: '서울',
  heightCm: 163,
  job: '금융권',
  hobbies: ['워터파크', '스노보드'],
  appealPoints: ['무던하다', '인간관계가 깔끔하다'],
  idealType: ['175cm 이상', '담백한 분'],
  partnerBirthYearMin: 1997,
  partnerBirthYearMax: 2004,
  partnerRegions: ['서울', '경기', '인천'],
  dealBreakers: ['이성문제', '술 영업'],
};

describe('ExtractedSchema', () => {
  it('정상 형태를 통과시킨다', () => {
    expect(ExtractedSchema.parse(valid)).toEqual(valid);
  });

  it('모르는 항목은 null을 허용한다', () => {
    const parsed = ExtractedSchema.parse({ ...valid, heightCm: null, job: null });
    expect(parsed.heightCm).toBeNull();
    expect(parsed.job).toBeNull();
  });

  it('배열 항목이 빠지면 실패한다', () => {
    const { hobbies, ...rest } = valid;
    expect(() => ExtractedSchema.parse(rest)).toThrow();
  });

  it('gender는 F/M/null만 허용한다', () => {
    expect(() => ExtractedSchema.parse({ ...valid, gender: '여성' })).toThrow();
    expect(ExtractedSchema.parse({ ...valid, gender: null }).gender).toBeNull();
  });
});

describe('extractFields', () => {
  it('parse 결과를 스키마로 검증해 돌려준다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: valid }));
    const result = await extractFields('원문', { parse });
    expect(result).toEqual(valid);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('원문을 사용자 메시지로 보낸다', async () => {
    const parse = vi.fn(async (_args: unknown) => ({ parsed_output: valid }));
    await extractFields('나는 02년생입니다', { parse });
    const args = parse.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(args.messages)).toContain('나는 02년생입니다');
  });

  it('"27살"류 만 나이를 출생연도로 잘못 환산하지 않도록 기준연도를 함께 보낸다', async () => {
    const parse = vi.fn(async (_args: unknown) => ({ parsed_output: valid }));
    await extractFields('27 / 여 / 154', { parse });
    const args = parse.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const content = args.messages[0].content;
    expect(content).toMatch(/<기준연도>\d{4}<\/기준연도>/);
    expect(content).toContain(String(new Date().getFullYear()));
  });

  it('금지된 샘플링 파라미터를 보내지 않는다', async () => {
    const parse = vi.fn(async (_args: unknown) => ({ parsed_output: valid }));
    await extractFields('원문', { parse });
    const args = parse.mock.calls[0][0] as Record<string, unknown>;
    expect(args.temperature).toBeUndefined();
    expect(args.top_p).toBeUndefined();
    expect(args.top_k).toBeUndefined();
  });

  it('thinking 여유를 두고 max_tokens를 넉넉히 잡는다', async () => {
    const parse = vi.fn(async (_args: unknown) => ({ parsed_output: valid }));
    await extractFields('원문', { parse });
    const args = parse.mock.calls[0][0] as { max_tokens: number };
    expect(args.max_tokens).toBeGreaterThanOrEqual(16000);
  });

  it('parsed_output이 스키마에 맞지 않으면 무엇이 틀렸는지 알려주며 던진다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: { gender: '여성' } }));
    await expect(extractFields('원문', { parse })).rejects.toThrow(/추출/);
  });

  it('parsed_output이 null이면 던진다', async () => {
    const parse = vi.fn(async () => ({ parsed_output: null }));
    await expect(extractFields('원문', { parse })).rejects.toThrow(/추출/);
  });
});

describe('EXTRACT_SYSTEM', () => {
  it('추측을 금지한다고 명시한다', () => {
    expect(EXTRACT_SYSTEM).toMatch(/추측/);
  });

  it('출생연도로 저장하라고 지시한다', () => {
    expect(EXTRACT_SYSTEM).toMatch(/출생연도/);
  });

  it('만 나이 숫자를 기준연도로 환산하는 규칙을 포함한다', () => {
    expect(EXTRACT_SYSTEM).toMatch(/기준연도/);
  });

  it('이상형 나이차이(위로/아래로 N살) 환산 규칙을 포함한다', () => {
    expect(EXTRACT_SYSTEM).toMatch(/나이차이/);
    expect(EXTRACT_SYSTEM).toMatch(/위로/);
    expect(EXTRACT_SYSTEM).toMatch(/아래로/);
  });
});

import { describe, it, expect } from 'vitest';
import { getEnv } from '@/lib/env';

const full = {
  DATABASE_URL: 'postgresql://localhost/x',
  ADMIN_PASSWORD: 'pw',
  SESSION_SECRET: 'a'.repeat(32),
  ANTHROPIC_API_KEY: 'sk-ant-x',
  OPENAI_API_KEY: 'sk-openai-x',
  PHOTO_DIR: './.photos',
};

describe('getEnv', () => {
  it('필요한 값을 모두 읽는다', () => {
    const env = getEnv(full);
    expect(env.databaseUrl).toBe('postgresql://localhost/x');
    expect(env.adminPassword).toBe('pw');
    expect(env.photoDir).toBe('./.photos');
  });

  it('PHOTO_DIR이 없으면 기본값을 쓴다', () => {
    const { PHOTO_DIR, ...rest } = full;
    expect(getEnv(rest).photoDir).toBe('./.photos');
  });

  it('필수 값이 비면 무엇이 빠졌는지 알려주며 실패한다', () => {
    const { ADMIN_PASSWORD, ...rest } = full;
    expect(() => getEnv(rest)).toThrow(/ADMIN_PASSWORD/);
  });

  it('SESSION_SECRET이 너무 짧으면 실패한다', () => {
    expect(() => getEnv({ ...full, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });

  it('OPS_API_TOKEN이 없거나 짧으면 null', () => {
    expect(getEnv(full).opsApiToken).toBeNull();
    expect(getEnv({ ...full, OPS_API_TOKEN: 'short' }).opsApiToken).toBeNull();
    expect(getEnv({ ...full, OPS_API_TOKEN: 'x'.repeat(16) }).opsApiToken).toBe('x'.repeat(16));
  });

  it('LLM_MODE 기본은 live, mock 가능', () => {
    expect(getEnv(full).llmMode).toBe('live');
    expect(getEnv({ ...full, LLM_MODE: 'mock' }).llmMode).toBe('mock');
  });

  it('기본 provider는 OpenAI이고 모델은 선택사항이다', () => {
    const env = getEnv(full);
    expect(env.llmProvider).toBe('openai');
    expect(env.llmModel).toBeNull();
    expect(env.anthropicApiKey).toBe('sk-ant-x');
    expect(env.openaiApiKey).toBe('sk-openai-x');
    expect(env.llmReasoning).toBe('high');
  });

  it('빈 LLM_MODEL은 미설정으로 취급한다', () => {
    expect(getEnv({ ...full, LLM_MODEL: '' }).llmModel).toBeNull();
  });

  it('OpenAI provider는 OpenAI 키와 모델을 읽는다', () => {
    const env = getEnv({
      ...full,
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: 'sk-openai-x',
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'gpt-test',
    });
    expect(env.llmProvider).toBe('openai');
    expect(env.llmModel).toBe('gpt-test');
    expect(env.openaiApiKey).toBe('sk-openai-x');
    expect(env.anthropicApiKey).toBeNull();
  });

  it('reasoning은 high가 기본이고 명시적으로 조정할 수 있다', () => {
    expect(getEnv({ ...full, LLM_REASONING: 'medium' }).llmReasoning).toBe('medium');
  });

  it('provider 키는 runtime 설정에서 관리할 수 있다', () => {
    const env = getEnv({
      ...full,
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      LLM_PROVIDER: 'openai',
    });
    expect(env.openaiApiKey).toBeNull();
    expect(env.anthropicApiKey).toBeNull();
  });

  it('mock은 provider 키 없이도 설정할 수 있다', () => {
    const { ANTHROPIC_API_KEY, OPENAI_API_KEY, ...withoutKey } = full;
    expect(
      getEnv({ ...withoutKey, LLM_MODE: 'mock', LLM_PROVIDER: 'openai' }).llmMode
    ).toBe('mock');
  });
});

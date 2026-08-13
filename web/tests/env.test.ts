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

  it('THREADS_* 값이 없으면 null이고, 있으면 trim해서 읽는다', () => {
    expect(getEnv(full).threadsAppId).toBeNull();
    expect(getEnv(full).threadsAppSecret).toBeNull();
    expect(getEnv(full).threadsRedirectUri).toBeNull();
    const env = getEnv({
      ...full,
      THREADS_APP_ID: ' app123 ',
      THREADS_APP_SECRET: 'secret123',
      THREADS_REDIRECT_URI: 'https://example.com/api/admin/threads/callback',
    });
    expect(env.threadsAppId).toBe('app123');
    expect(env.threadsAppSecret).toBe('secret123');
    expect(env.threadsRedirectUri).toBe('https://example.com/api/admin/threads/callback');
  });

  // .env.example의 THREADS_APP_ID= 처럼 "키는 있지만 값이 빈 문자열"인 경우를 반드시
  // null로 취급해야 한다. min(1)만 걸면 빈 문자열이 optional()을 우회하지 못하고 그대로
  // getEnv() 전체를 던지게 만든다 — cp .env.example .env로 시작한 모든 로컬 개발이 즉시
  // 깨진다(기존 GCP_PROJECT_ID가 이미 이 함정에 빠져 있었다: 로컬에서 재현 확인함).
  it('THREADS_*가 빈 문자열이어도(.env.example 그대로) 예외 없이 null이다', () => {
    const env = getEnv({
      ...full,
      THREADS_APP_ID: '',
      THREADS_APP_SECRET: '',
      THREADS_REDIRECT_URI: '',
    });
    expect(env.threadsAppId).toBeNull();
    expect(env.threadsAppSecret).toBeNull();
    expect(env.threadsRedirectUri).toBeNull();
  });
});

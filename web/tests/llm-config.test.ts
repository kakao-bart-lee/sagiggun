import { describe, expect, it } from 'vitest';
import { requireLlmApiKey, resolveModel, toPublicLlmConfig } from '@/lib/llm/config';

const base = {
  mode: 'live' as const,
  provider: 'openai' as const,
  model: 'gpt-5.6-luna',
  reasoning: 'high' as const,
  openaiApiKey: null,
  anthropicApiKey: null,
};

describe('LLM runtime config', () => {
  it('provider별 키가 없으면 live 호출을 거부한다', () => {
    expect(() => requireLlmApiKey(base)).toThrow(/OPENAI_API_KEY/);
    expect(() =>
      requireLlmApiKey({ ...base, provider: 'anthropic', anthropicApiKey: null })
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('설정된 키만 runtime client에 전달한다', () => {
    expect(requireLlmApiKey({ ...base, openaiApiKey: 'sk-test' })).toBe('sk-test');
  });

  it('공개 설정에는 키 원문을 포함하지 않는다', () => {
    const publicConfig = toPublicLlmConfig(
      { ...base, openaiApiKey: 'sk-secret', anthropicApiKey: 'sk-ant-secret' },
      {
        gcpProjectId: 'project',
        llmConfigSecret: 'config',
      }
    );
    expect(publicConfig).not.toHaveProperty('openaiApiKey');
    expect(publicConfig).not.toHaveProperty('anthropicApiKey');
    expect(publicConfig.openaiConfigured).toBe(true);
    expect(publicConfig.anthropicConfigured).toBe(true);
  });

  it('provider별 기본 모델을 사용한다', () => {
    expect(resolveModel('openai', '')).toBe('gpt-5.6-luna');
    expect(resolveModel('anthropic', '')).toBe('claude-sonnet-5');
  });
});

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  resolveModel,
} from '@/lib/llm/client';

describe('LLM defaults', () => {
  it('OpenAI 기본 모델은 gpt-5.6-luna다', () => {
    expect(resolveModel('openai', null)).toBe('gpt-5.6-luna');
    expect(DEFAULT_OPENAI_MODEL).toBe('gpt-5.6-luna');
  });

  it('Anthropic을 명시하면 기존 기본 모델을 사용한다', () => {
    expect(resolveModel('anthropic', null)).toBe(DEFAULT_ANTHROPIC_MODEL);
  });

  it('명시한 모델은 provider 기본값보다 우선한다', () => {
    expect(resolveModel('openai', 'gpt-custom')).toBe('gpt-custom');
  });
});

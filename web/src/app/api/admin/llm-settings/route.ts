import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getLlmConfig,
  saveLlmConfig,
  toPublicLlmConfig,
} from '@/lib/llm/config';

const requestSchema = z.object({
  mode: z.enum(['live', 'mock']),
  provider: z.enum(['anthropic', 'openai']),
  model: z.string().trim().min(1).max(120),
  reasoning: z.enum(['low', 'medium', 'high']),
  openaiApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  clearOpenaiApiKey: z.boolean().default(false),
  clearAnthropicApiKey: z.boolean().default(false),
});

export async function GET() {
  const config = await getLlmConfig();
  return NextResponse.json(toPublicLlmConfig(config));
}

export async function PUT(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'LLM 설정 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const current = await getLlmConfig();
  const input = parsed.data;
  const next = {
    mode: input.mode,
    provider: input.provider,
    model: input.model,
    reasoning: input.reasoning,
    openaiApiKey: input.clearOpenaiApiKey
      ? null
      : input.openaiApiKey?.trim() || current.openaiApiKey,
    anthropicApiKey: input.clearAnthropicApiKey
      ? null
      : input.anthropicApiKey?.trim() || current.anthropicApiKey,
  };

  try {
    const saved = await saveLlmConfig(next);
    return NextResponse.json({ ok: true, ...toPublicLlmConfig(saved) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('API_KEY')) {
      return NextResponse.json(
        { error: 'live 모드에서는 선택한 provider의 API 키가 필요합니다.' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: '설정을 저장할 Secret Manager에 연결할 수 없습니다.' },
      { status: 503 }
    );
  }
}

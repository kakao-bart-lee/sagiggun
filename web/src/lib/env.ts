import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),
  // 서명 키가 짧으면 세션 위조가 쉬워진다. 32자 이상을 강제한다.
  SESSION_SECRET: z.string().min(32),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  PHOTO_DIR: z.string().min(1).default('./.photos'),
  // 확장 프로그램 API용. 비우거나 짧으면 Bearer 비활성.
  OPS_API_TOKEN: z.string().optional(),
  // live = 선택한 LLM API, mock = 결정적 픽스처 (e2e/로컬)
  LLM_MODE: z.enum(['live', 'mock']).default('live'),
  LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('openai'),
  // 비우면 provider별 기본 모델을 사용한다.
  LLM_MODEL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional()
  ),
  LLM_REASONING: z.enum(['low', 'medium', 'high']).default('high'),
  // 설정 시 GCS 버킷에 사진 저장 (Cloud Run). 비우면 PHOTO_DIR 로컬 파일.
  PHOTO_BUCKET: z.string().optional(),
});

export type Env = {
  databaseUrl: string;
  adminPassword: string;
  sessionSecret: string;
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  photoDir: string;
  opsApiToken: string | null;
  llmMode: 'live' | 'mock';
  llmProvider: 'anthropic' | 'openai';
  llmModel: string | null;
  llmReasoning: 'low' | 'medium' | 'high';
  photoBucket: string | null;
};

export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`환경변수가 올바르지 않습니다: ${fields}`);
  }
  const v = parsed.data;
  const anthropicApiKey = v.ANTHROPIC_API_KEY?.trim() || null;
  const openaiApiKey = v.OPENAI_API_KEY?.trim() || null;
  if (v.LLM_MODE === 'live') {
    const missingKey = v.LLM_PROVIDER === 'anthropic' ? !anthropicApiKey : !openaiApiKey;
    if (missingKey) {
      const key = v.LLM_PROVIDER === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      throw new Error(`환경변수가 올바르지 않습니다: ${key}`);
    }
  }
  const ops = v.OPS_API_TOKEN?.trim() || '';
  const bucket = v.PHOTO_BUCKET?.trim() || '';
  return {
    databaseUrl: v.DATABASE_URL,
    adminPassword: v.ADMIN_PASSWORD,
    sessionSecret: v.SESSION_SECRET,
    anthropicApiKey,
    openaiApiKey,
    photoDir: v.PHOTO_DIR,
    opsApiToken: ops.length >= 16 ? ops : null,
    llmMode: v.LLM_MODE,
    llmProvider: v.LLM_PROVIDER,
    llmModel: v.LLM_MODEL ?? null,
    llmReasoning: v.LLM_REASONING,
    photoBucket: bucket || null,
  };
}

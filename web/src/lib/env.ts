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
  // 설정 UI가 저장할 Secret Manager 리소스. 로컬에서는 비워두면 env 설정만 사용한다.
  GCP_PROJECT_ID: z.string().trim().min(1).optional(),
  LLM_CONFIG_SECRET: z.string().trim().min(1).optional(),
  // 설정 시 GCS 버킷에 사진 저장 (Cloud Run). 비우면 PHOTO_DIR 로컬 파일.
  PHOTO_BUCKET: z.string().optional(),
  // Threads Publishing API. 셋 다 없으면 연결 기능이 비활성(503).
  THREADS_APP_ID: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional()
  ),
  THREADS_APP_SECRET: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).optional()
  ),
  // Meta는 https redirect URI만 허용한다. 형식이 틀리면 콜백 라우트의 new URL()이 던지는
  // 애매한 500 대신, 기동 시점에 바로 실패하게 한다.
  THREADS_REDIRECT_URI: z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' ? undefined : trimmed;
    },
    z.url({ protocol: /^https$/ }).optional()
  ),
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
  gcpProjectId: string | null;
  llmConfigSecret: string | null;
  photoBucket: string | null;
  threadsAppId: string | null;
  threadsAppSecret: string | null;
  threadsRedirectUri: string | null;
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
  const ops = v.OPS_API_TOKEN?.trim() || '';
  const bucket = v.PHOTO_BUCKET?.trim() || '';
  const projectId = v.GCP_PROJECT_ID?.trim() || '';
  const configSecret = v.LLM_CONFIG_SECRET?.trim() || '';
  const threadsAppId = v.THREADS_APP_ID?.trim() || '';
  const threadsAppSecret = v.THREADS_APP_SECRET?.trim() || '';
  const threadsRedirectUri = v.THREADS_REDIRECT_URI?.trim() || '';
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
    gcpProjectId: projectId || null,
    llmConfigSecret: configSecret || null,
    photoBucket: bucket || null,
    threadsAppId: threadsAppId || null,
    threadsAppSecret: threadsAppSecret || null,
    threadsRedirectUri: threadsRedirectUri || null,
  };
}

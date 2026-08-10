import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { z } from 'zod';
import { getEnv, type Env } from '@/lib/env';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
const CONFIG_VERSION = 1;
const CACHE_TTL_MS = 30_000;

const StoredLlmConfigSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  mode: z.enum(['live', 'mock']),
  provider: z.enum(['anthropic', 'openai']),
  model: z.string().trim().min(1),
  reasoning: z.enum(['low', 'medium', 'high']),
  openaiApiKey: z.string().optional().nullable(),
  anthropicApiKey: z.string().optional().nullable(),
});

export type LlmConfig = {
  mode: 'live' | 'mock';
  provider: 'anthropic' | 'openai';
  model: string;
  reasoning: 'low' | 'medium' | 'high';
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
};

export type PublicLlmConfig = Omit<LlmConfig, 'openaiApiKey' | 'anthropicApiKey'> & {
  openaiConfigured: boolean;
  anthropicConfigured: boolean;
  secretManagerWritable: boolean;
};

export type LlmConfigInput = Omit<LlmConfig, 'openaiApiKey' | 'anthropicApiKey'> & {
  openaiApiKey?: string | null;
  anthropicApiKey?: string | null;
};

let secretManager: SecretManagerServiceClient | undefined;
let cached: { config: LlmConfig; expiresAt: number } | undefined;

export function resolveModel(provider: LlmConfig['provider'], model: string | null | undefined) {
  if (model?.trim()) return model.trim();
  return provider === 'openai' ? DEFAULT_OPENAI_MODEL : DEFAULT_ANTHROPIC_MODEL;
}

function normalizeKey(key: string | null | undefined): string | null {
  const value = key?.trim() || '';
  return value || null;
}

function fromEnv(env: Env): LlmConfig {
  return {
    mode: env.llmMode,
    provider: env.llmProvider,
    model: resolveModel(env.llmProvider, env.llmModel),
    reasoning: env.llmReasoning,
    openaiApiKey: normalizeKey(env.openaiApiKey),
    anthropicApiKey: normalizeKey(env.anthropicApiKey),
  };
}

function getSecretManager() {
  return (secretManager ??= new SecretManagerServiceClient());
}

function secretVersionName(env: Pick<Env, 'gcpProjectId' | 'llmConfigSecret'>): string | null {
  if (!env.gcpProjectId || !env.llmConfigSecret) return null;
  return `projects/${env.gcpProjectId}/secrets/${env.llmConfigSecret}/versions/latest`;
}

async function readStoredConfig(env: Env): Promise<LlmConfig | null> {
  const name = secretVersionName(env);
  if (!name) return null;

  const [version] = await getSecretManager().accessSecretVersion({ name });
  const data = version.payload?.data;
  if (!data) return null;
  const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
  const parsed = StoredLlmConfigSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error('LLM 설정 Secret 형식이 올바르지 않습니다.');
  return {
    mode: parsed.data.mode,
    provider: parsed.data.provider,
    model: parsed.data.model,
    reasoning: parsed.data.reasoning,
    openaiApiKey: normalizeKey(parsed.data.openaiApiKey),
    anthropicApiKey: normalizeKey(parsed.data.anthropicApiKey),
  };
}

export async function getLlmConfig(): Promise<LlmConfig> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.config;

  const env = getEnv();
  let config = fromEnv(env);
  try {
    config = (await readStoredConfig(env)) ?? config;
  } catch {
    // Secret Manager가 없는 로컬 환경에서는 기존 env 설정으로 계속 동작한다.
  }
  cached = { config, expiresAt: now + CACHE_TTL_MS };
  return config;
}

export function clearLlmConfigCache() {
  cached = undefined;
}

export function toPublicLlmConfig(
  config: LlmConfig,
  env: Pick<Env, 'gcpProjectId' | 'llmConfigSecret'> = getEnv()
): PublicLlmConfig {
  return {
    mode: config.mode,
    provider: config.provider,
    model: config.model,
    reasoning: config.reasoning,
    openaiConfigured: Boolean(config.openaiApiKey),
    anthropicConfigured: Boolean(config.anthropicApiKey),
    secretManagerWritable: Boolean(secretVersionName(env)),
  };
}

export function requireLlmApiKey(config: LlmConfig): string {
  if (config.provider === 'openai' && config.openaiApiKey) return config.openaiApiKey;
  if (config.provider === 'anthropic' && config.anthropicApiKey) return config.anthropicApiKey;
  const key = config.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  throw new Error(`${key}가 설정되지 않았습니다. 관리자 설정에서 API 키를 저장해 주세요.`);
}

export async function saveLlmConfig(input: LlmConfigInput): Promise<LlmConfig> {
  const env = getEnv();
  const parent = env.gcpProjectId && env.llmConfigSecret
    ? `projects/${env.gcpProjectId}/secrets/${env.llmConfigSecret}`
    : null;
  if (!parent) {
    throw new Error('Secret Manager 설정이 없어 LLM 설정을 저장할 수 없습니다.');
  }

  const config: LlmConfig = {
    mode: input.mode,
    provider: input.provider,
    model: resolveModel(input.provider, input.model),
    reasoning: input.reasoning,
    openaiApiKey: normalizeKey(input.openaiApiKey),
    anthropicApiKey: normalizeKey(input.anthropicApiKey),
  };
  if (config.mode === 'live') requireLlmApiKey(config);

  await getSecretManager().addSecretVersion({
    parent,
    payload: { data: Buffer.from(JSON.stringify({ version: CONFIG_VERSION, ...config })) },
  });
  cached = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}

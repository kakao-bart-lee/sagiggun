import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '@/lib/env';

export const MODEL = 'claude-opus-5';

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: getEnv().anthropicApiKey });
  return client;
}

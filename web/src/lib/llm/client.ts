import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ZodType } from 'zod';
import { getEnv } from '@/lib/env';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  requireLlmApiKey,
  resolveModel,
  type LlmConfig,
} from './config';

export { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL, resolveModel } from './config';

export type ParseFn = (args: unknown) => Promise<{ parsed_output: unknown }>;

export type CreateFn = (
  args: unknown
) => Promise<{ content: Array<{ type: string; text?: string }> }>;

type TextBlock = { type: 'text'; text: string };
type ImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
};
type InputBlock = TextBlock | ImageBlock;
type ProviderMessage = { role: 'user' | 'assistant'; content: string | InputBlock[] };
type ProviderRequest = {
  model: string;
  max_tokens?: number;
  output_config?: { effort?: 'low' | 'medium' | 'high'; format?: unknown };
  system?: string;
  messages: ProviderMessage[];
};

let anthropicClient: Anthropic | undefined;
let anthropicApiKey: string | undefined;
let openaiClient: OpenAI | undefined;
let openaiApiKey: string | undefined;

export function getAnthropic(config: LlmConfig): Anthropic {
  const apiKey = requireLlmApiKey(config);
  if (config.provider !== 'anthropic') {
    throw new Error('현재 LLM provider가 Anthropic이 아닙니다.');
  }
  if (!anthropicClient || anthropicApiKey !== apiKey) {
    anthropicClient = new Anthropic({ apiKey });
    anthropicApiKey = apiKey;
  }
  return anthropicClient;
}

export function getOpenAI(config: LlmConfig): OpenAI {
  const apiKey = requireLlmApiKey(config);
  if (config.provider !== 'openai') {
    throw new Error('현재 LLM provider가 OpenAI가 아닙니다.');
  }
  if (!openaiClient || openaiApiKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    openaiApiKey = apiKey;
  }
  return openaiClient;
}

export function getModel(): string {
  const env = getEnv();
  return resolveModel(env.llmProvider, env.llmModel);
}

export function getReasoningEffort(): 'low' | 'medium' | 'high' {
  return getEnv().llmReasoning;
}

function asProviderRequest(args: unknown): ProviderRequest {
  return args as ProviderRequest;
}

/** Anthropic의 메시지 블록을 OpenAI Responses 입력 블록으로 변환한다. */
export function toOpenAIInput(args: unknown): Array<Record<string, unknown>> {
  const request = asProviderRequest(args);
  const input: Array<Record<string, unknown>> = [];
  if (request.system) {
    input.push({
      role: 'system',
      content: [{ type: 'input_text', text: request.system }],
    });
  }

  for (const message of request.messages) {
    const blocks =
      typeof message.content === 'string'
        ? [{ type: 'input_text', text: message.content }]
        : message.content.map((block) => {
            if (block.type === 'text') return { type: 'input_text', text: block.text };
            return {
              type: 'input_image',
              image_url: `data:${block.source.media_type};base64,${block.source.data}`,
              detail: 'high',
            };
          });
    input.push({ role: message.role, content: blocks });
  }
  return input;
}

function reasoning(args: ProviderRequest) {
  const effort = args.output_config?.effort ?? 'high';
  return { effort };
}

export function getStructuredParser<T>(
  schema: ZodType<T>,
  schemaName: string,
  config: LlmConfig
): ParseFn {
  if (config.provider === 'anthropic') {
    return (args) =>
      getAnthropic(config).messages.parse(args as never) as Promise<{
        parsed_output: unknown;
      }>;
  }

  return async (args) => {
    const request = asProviderRequest(args);
    const response = await getOpenAI(config).responses.parse({
      model: request.model,
      max_output_tokens: request.max_tokens,
      reasoning: reasoning(request),
      input: toOpenAIInput(request),
      text: { format: zodTextFormat(schema, schemaName) },
    } as never);
    return { parsed_output: response.output_parsed };
  };
}

export function getTextCreator(config: LlmConfig): CreateFn {
  if (config.provider === 'anthropic') {
    return (args) =>
      getAnthropic(config).messages.create(args as never) as Promise<{
        content: Array<{ type: string; text?: string }>;
      }>;
  }

  return async (args) => {
    const request = asProviderRequest(args);
    const response = await getOpenAI(config).responses.create({
      model: request.model,
      max_output_tokens: request.max_tokens,
      reasoning: reasoning(request),
      input: toOpenAIInput(request),
    } as never);
    return { content: [{ type: 'text', text: response.output_text }] };
  };
}

'use client';

import { useState } from 'react';
import { StampButton } from '@/components/admin-ui';
import type { PublicLlmConfig } from '@/lib/llm/config';

const fieldClass =
  'mt-2 w-full rounded-[8px] border-2 border-edge bg-field p-3 text-on-card outline-none focus:border-yellow';

export function LlmSettingsForm({ initial }: { initial: PublicLlmConfig }) {
  const [mode, setMode] = useState(initial.mode);
  const [provider, setProvider] = useState(initial.provider);
  const [model, setModel] = useState(initial.model);
  const [reasoning, setReasoning] = useState(initial.reasoning);
  const [openaiConfigured, setOpenaiConfigured] = useState(initial.openaiConfigured);
  const [anthropicConfigured, setAnthropicConfigured] = useState(initial.anthropicConfigured);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [clearOpenaiApiKey, setClearOpenaiApiKey] = useState(false);
  const [clearAnthropicApiKey, setClearAnthropicApiKey] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; text: string }>({
    kind: 'idle',
    text: '',
  });

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: 'saving', text: '' });
    const response = await fetch('/api/admin/llm-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        provider,
        model,
        reasoning,
        openaiApiKey,
        anthropicApiKey,
        clearOpenaiApiKey,
        clearAnthropicApiKey,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as PublicLlmConfig & { error?: string };
    if (!response.ok) {
      setState({ kind: 'error', text: data.error ?? '설정을 저장하지 못했습니다.' });
      return;
    }
    setOpenaiApiKey('');
    setAnthropicApiKey('');
    setClearOpenaiApiKey(false);
    setClearAnthropicApiKey(false);
    setOpenaiConfigured(Boolean(data.openaiConfigured));
    setAnthropicConfigured(Boolean(data.anthropicConfigured));
    setState({ kind: 'saved', text: '저장했습니다. 다음 LLM 요청부터 설정이 적용됩니다.' });
  }

  const configured = provider === 'openai' ? openaiConfigured : anthropicConfigured;

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div className="rounded-[8px] border-2 border-telop-blue/40 bg-telop-blue/10 p-4 text-sm text-fog">
        API 키는 화면이나 DB에 다시 표시하지 않고 Secret Manager에 저장합니다. 키를 입력하지
        않고 저장하면 기존 키를 유지합니다.
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-fog">
          실행 모드
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className={fieldClass}>
            <option value="mock">mock — API 호출 안 함</option>
            <option value="live">live — 실제 API 호출</option>
          </select>
        </label>
        <label className="text-sm font-bold text-fog">
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
            className={fieldClass}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-fog">
          모델
          <input value={model} onChange={(e) => setModel(e.target.value)} className={fieldClass} required />
        </label>
        <label className="text-sm font-bold text-fog">
          Reasoning
          <select
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value as typeof reasoning)}
            className={fieldClass}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      </div>

      <div className="border-t-2 border-edge pt-5">
        <h2 className="text-lg font-extrabold text-fog">API 키</h2>
        <p className="mt-1 text-xs text-fog-muted">
          현재 provider: {configured ? '키 설정됨' : '키 미설정'}. 입력값은 저장 후 비워집니다.
        </p>
        <label className="mt-4 block text-sm font-bold text-fog">
          OpenAI API key
          <input
            type="password"
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
            className={fieldClass}
            autoComplete="new-password"
            placeholder={openaiConfigured ? '기존 키 유지' : 'sk-...'}
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-xs font-normal text-fog-muted">
          <input
            type="checkbox"
            checked={clearOpenaiApiKey}
            onChange={(e) => setClearOpenaiApiKey(e.target.checked)}
          />
          저장된 OpenAI 키 삭제
        </label>

        <label className="mt-5 block text-sm font-bold text-fog">
          Anthropic API key
          <input
            type="password"
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            className={fieldClass}
            autoComplete="new-password"
            placeholder={anthropicConfigured ? '기존 키 유지' : 'sk-ant-...'}
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-xs font-normal text-fog-muted">
          <input
            type="checkbox"
            checked={clearAnthropicApiKey}
            onChange={(e) => setClearAnthropicApiKey(e.target.checked)}
          />
          저장된 Anthropic 키 삭제
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <StampButton type="submit" disabled={state.kind === 'saving' || !initial.secretManagerWritable}>
          {state.kind === 'saving' ? '저장 중…' : '설정 저장'}
        </StampButton>
        {!initial.secretManagerWritable ? (
          <span className="text-xs font-bold text-telop-red">Secret Manager 설정이 없어 저장할 수 없습니다.</span>
        ) : null}
        {state.text ? (
          <span className={`text-sm font-bold ${state.kind === 'error' ? 'text-telop-red' : 'text-telop-blue'}`}>
            {state.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

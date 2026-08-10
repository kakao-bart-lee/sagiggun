import { AdminTopBar, Panel } from '@/components/admin-ui';
import { getLlmConfig, toPublicLlmConfig } from '@/lib/llm/config';
import { LlmSettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const config = await getLlmConfig();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <AdminTopBar />
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-fog">설정</h1>
        <p className="mt-1 text-sm text-fog-muted">LLM provider와 관리자용 API 키를 관리합니다.</p>
      </div>
      <Panel>
        <LlmSettingsForm initial={toPublicLlmConfig(config)} />
      </Panel>
    </main>
  );
}

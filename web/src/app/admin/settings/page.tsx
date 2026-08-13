import { AdminTopBar, Panel } from '@/components/admin-ui';
import { getLlmConfig, toPublicLlmConfig } from '@/lib/llm/config';
import { getThreadsAccount } from '@/lib/threads/account';
import { LlmSettingsForm } from './settings-form';
import { ThreadsSettings } from './threads-settings';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ threadsError?: string }>;
}) {
  const config = await getLlmConfig();
  const threadsAccount = await getThreadsAccount();
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <AdminTopBar />
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-fog">설정</h1>
        <p className="mt-1 text-sm text-fog-muted">
          LLM provider, Threads 연결, 관리자용 API 키를 관리합니다.
        </p>
      </div>
      <Panel>
        <LlmSettingsForm initial={toPublicLlmConfig(config)} />
      </Panel>
      <div className="mt-6">
        <Panel>
          <ThreadsSettings
            initial={{
              connected: Boolean(threadsAccount),
              username: threadsAccount?.username ?? null,
              tokenExpiresAt: threadsAccount?.tokenExpiresAt.toISOString() ?? null,
            }}
            errorMessage={params.threadsError ?? null}
          />
        </Panel>
      </div>
    </main>
  );
}

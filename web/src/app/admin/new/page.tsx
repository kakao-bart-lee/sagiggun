'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdminTopBar, Panel, StampButton } from '@/components/admin-ui';

export default function NewProfilePage() {
  const router = useRouter();
  const [sourceHandle, setHandle] = useState('');
  const [rawText, setRawText] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setCreatedId(null);

    const created = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceHandle, rawText }),
    });
    const data = await created.json().catch(() => ({}));
    if (!created.ok) {
      setMessage(data.error ?? '프로필을 만들지 못했습니다.');
      setBusy(false);
      return;
    }

    let needsAttention = false;
    if (data.duplicates?.length) {
      setMessage(`같은 핸들의 프로필이 ${data.duplicates.length}건 있습니다. 확인해 주세요.`);
      needsAttention = true;
    }

    if (files && files.length > 0) {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('photos', file);
      const uploaded = await fetch(`/api/profiles/${data.profile.id}/photos`, {
        method: 'POST',
        body: form,
      });
      const result = await uploaded.json().catch(() => ({}));
      if (result.failed?.length) {
        setMessage(`사진 ${result.failed.length}장이 실패했습니다: ${result.failed[0].reason}`);
        needsAttention = true;
      }
    }

    setBusy(false);

    if (needsAttention) {
      setCreatedId(data.profile.id);
      return;
    }

    router.push(`/admin/profiles/${data.profile.id}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <AdminTopBar />
      <h1 className="mb-6 text-[32px] font-extrabold tracking-tight text-fog">새 프로필</h1>

      <Panel>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted-on-card">스레드 핸들</span>
            <input
              value={sourceHandle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@handle"
              required
              className="rounded-[8px] border-2 border-edge bg-field p-3 text-on-card"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted-on-card">DM 원문</span>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              required
              className="rounded-[8px] border-2 border-edge bg-field p-3 font-mono text-sm text-on-card"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted-on-card">사진 (최대 10장, 장당 10MB)</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFiles(e.target.files)}
              className="text-sm text-muted-on-card"
            />
          </label>

          <StampButton type="submit" disabled={busy} className="w-full">
            {busy ? '저장 중…' : '저장하고 검수로'}
          </StampButton>
        </form>
      </Panel>

      {message && (
        <p className="mt-4 text-sm font-bold text-yellow">
          {message}
          {createdId && (
            <>
              {' '}
              <Link href={`/admin/profiles/${createdId}`} className="underline">
                생성된 프로필로 이동
              </Link>
            </>
          )}
        </p>
      )}
    </main>
  );
}

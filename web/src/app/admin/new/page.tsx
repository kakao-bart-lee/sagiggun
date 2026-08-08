'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewProfilePage() {
  const router = useRouter();
  const [sourceHandle, setHandle] = useState('');
  const [rawText, setRawText] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const created = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceHandle, rawText }),
    });
    const data = await created.json().catch(() => ({}));
    if (!created.ok) {
      setMessage(data.error ?? '입수에 실패했습니다.');
      setBusy(false);
      return;
    }

    if (data.duplicates?.length) {
      setMessage(`같은 핸들의 프로필이 ${data.duplicates.length}건 있습니다. 확인해 주세요.`);
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
        setBusy(false);
        return;
      }
    }

    router.push(`/admin/profiles/${data.profile.id}`);
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-lg font-semibold">새 프로필 입수</h1>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">스레드 핸들</span>
          <input
            value={sourceHandle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@handle"
            required
            className="rounded-lg border border-neutral-700 bg-neutral-950 p-3"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">DM 원문</span>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
            required
            className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 font-mono text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-neutral-400">사진 (최대 10장, 장당 10MB)</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFiles(e.target.files)}
            className="text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-neutral-100 p-3 font-medium text-neutral-900 disabled:opacity-50"
        >
          {busy ? '저장 중…' : '저장'}
        </button>
      </form>
      {message && <p className="mt-4 text-sm text-amber-400">{message}</p>}
    </main>
  );
}

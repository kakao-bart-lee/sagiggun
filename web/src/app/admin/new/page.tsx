'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewProfilePage() {
  const router = useRouter();
  const [sourceHandle, setHandle] = useState('');
  const [rawText, setRawText] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // 프로필은 만들어졌지만 운영자가 봐야 할 게 있어서 이 화면에 머무를 때, 방금 만든
  // 프로필로 가는 링크를 띄우기 위한 id.
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
      setMessage(data.error ?? '입수에 실패했습니다.');
      setBusy(false);
      return;
    }

    // 성공도 실패도 아닌 "운영자가 봐야 하는" 상태. 예전에는 중복 경고를 띄운 뒤
    // 곧바로 router.push로 화면을 떠나 경고가 유실됐고(I-6), 사진 업로드가 실패하면
    // 프로필은 이미 만들어졌는데 이동도 링크도 없이 갇혔다(I-7). 둘 다 같은 처방이다 —
    // 페이지에 머무르며 만들어진 프로필로 가는 링크를 주고 판단은 운영자에게 맡긴다.
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
      {message && (
        <p className="mt-4 text-sm text-amber-400">
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

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (response.ok) {
      router.push('/admin');
      router.refresh();
      return;
    }
    const data = await response.json().catch(() => ({}));
    setError(data.error ?? '로그인에 실패했습니다.');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-lg font-semibold">매칭 관리자</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="rounded-lg border border-neutral-700 bg-neutral-950 p-3"
          autoFocus
        />
        <button type="submit" className="rounded-lg bg-neutral-100 p-3 font-medium text-neutral-900">
          로그인
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </main>
  );
}

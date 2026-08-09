'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Panel, StampButton } from '@/components/admin-ui';

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="text-[28px] font-extrabold tracking-tight text-fog">Some Love</p>
        <h1 className="mt-2 text-[20px] font-bold text-fog-muted">운영자 로그인</h1>
      </div>
      <Panel>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="rounded-[8px] border-2 border-edge bg-field p-3 text-on-card"
            autoFocus
          />
          <StampButton type="submit" className="w-full">
            로그인
          </StampButton>
        </form>
      </Panel>
      {error && <p className="text-sm font-bold text-telop-red">{error}</p>}
    </main>
  );
}

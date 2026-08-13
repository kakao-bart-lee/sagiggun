'use client';

import { useState } from 'react';
import { StampButton } from '@/components/admin-ui';

export type ThreadsStatus = {
  connected: boolean;
  username: string | null;
  tokenExpiresAt: string | null;
};

export function ThreadsSettings({
  initial,
  errorMessage,
}: {
  initial: ThreadsStatus;
  errorMessage: string | null;
}) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function disconnect() {
    if (!confirm('Threads 연결을 해제할까요?')) return;
    setBusy(true);
    setMessage('');
    const response = await fetch('/api/admin/threads/disconnect', { method: 'POST' });
    setBusy(false);
    if (!response.ok) {
      setMessage('연결 해제에 실패했습니다.');
      return;
    }
    setStatus({ connected: false, username: null, tokenExpiresAt: null });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-extrabold text-on-card">Threads 연동</h2>
      {errorMessage ? (
        <p className="text-sm font-bold text-telop-red">연결 실패: {errorMessage}</p>
      ) : null}
      {status.connected ? (
        <p className="text-sm text-on-card">
          연결됨 — @{status.username ?? '알 수 없음'}
          {status.tokenExpiresAt
            ? ` · 만료: ${new Date(status.tokenExpiresAt).toLocaleDateString('ko-KR')}`
            : ''}
        </p>
      ) : (
        <p className="text-sm text-muted-on-card">연결되지 않았습니다.</p>
      )}
      <div className="flex gap-3">
        {!status.connected && (
          <StampButton
            tone="blue"
            onClick={() => {
              window.location.href = '/api/admin/threads/connect';
            }}
          >
            Threads 연결
          </StampButton>
        )}
        {status.connected && (
          <StampButton tone="ghost" disabled={busy} onClick={disconnect}>
            {busy ? '해제 중…' : '연결 해제'}
          </StampButton>
        )}
      </div>
      {message ? <p className="text-sm font-bold text-telop-red">{message}</p> : null}
    </div>
  );
}

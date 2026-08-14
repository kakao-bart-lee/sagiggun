'use client';

import { useState } from 'react';
import { StampButton } from '@/components/admin-ui';

export type ThreadsStatus = {
  connected: boolean;
  username: string | null;
  tokenExpiresAt: string | null;
};

const fieldClass = 'rounded-[8px] border-2 border-edge bg-field p-2 text-sm text-on-card';

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
  const [testText, setTestText] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testPostId, setTestPostId] = useState<string | null>(null);

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

  async function postTest() {
    if (!testText.trim()) return;
    if (!confirm('Threads에 실제로 게시될 테스트 글입니다. 계속할까요?')) return;
    setTestBusy(true);
    setTestMessage('');
    setTestPostId(null);
    const response = await fetch('/api/admin/threads/test-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText }),
    });
    const data = await response.json().catch(() => ({}));
    setTestBusy(false);
    if (!response.ok) {
      setTestMessage(data.error ?? '게시에 실패했습니다.');
      return;
    }
    setTestPostId(data.postId);
    setTestMessage('게시했습니다.');
  }

  async function deleteTest() {
    if (!testPostId) return;
    if (!confirm('이 테스트 글을 Threads에서 지울까요?')) return;
    setTestBusy(true);
    const response = await fetch(`/api/admin/threads/test-post/${testPostId}`, {
      method: 'DELETE',
    });
    const data = await response.json().catch(() => ({}));
    setTestBusy(false);
    if (!response.ok) {
      setTestMessage(data.error ?? '삭제에 실패했습니다.');
      return;
    }
    setTestPostId(null);
    setTestMessage('지웠습니다.');
    setTestText('');
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

      {status.connected && (
        <div className="mt-2 flex flex-col gap-3 border-t-2 border-edge pt-4">
          <p className="text-sm font-bold text-on-card">
            테스트 게시 — 연결이 실제로 되는지 확인용. 실제로 Threads에 올라간다.
          </p>
          <textarea
            className={fieldClass}
            rows={2}
            placeholder="테스트 게시 문구"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
          <div className="flex gap-3">
            <StampButton tone="blue" disabled={testBusy || !testText.trim()} onClick={postTest}>
              {testBusy ? '게시 중…' : '테스트 게시'}
            </StampButton>
            {testPostId && (
              <StampButton tone="red" disabled={testBusy} onClick={deleteTest}>
                {testBusy ? '삭제 중…' : '테스트 글 삭제'}
              </StampButton>
            )}
          </div>
          {testMessage ? <p className="text-sm text-on-card">{testMessage}</p> : null}
        </div>
      )}
    </div>
  );
}

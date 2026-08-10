'use client';

import { StampButton } from '@/components/admin-ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeliveryActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState('');

  async function patch(next: 'INSERTED' | 'DONE' | 'CANCELLED') {
    setBusy(next);
    await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy('');
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'PENDING' && (
        <StampButton
          tone="ghost"
          className="min-h-9 px-3 py-1.5 text-xs"
          disabled={!!busy}
          onClick={() => void patch('INSERTED')}
        >
          삽입됨으로
        </StampButton>
      )}
      {(status === 'PENDING' || status === 'INSERTED') && (
        <StampButton
          tone="yellow"
          className="min-h-9 px-3 py-1.5 text-xs"
          disabled={!!busy}
          onClick={() => void patch('DONE')}
        >
          완료
        </StampButton>
      )}
      {(status === 'PENDING' || status === 'INSERTED') && (
        <StampButton
          tone="ghost"
          className="min-h-9 px-3 py-1.5 text-xs"
          disabled={!!busy}
          onClick={() => void patch('CANCELLED')}
        >
          취소
        </StampButton>
      )}
    </div>
  );
}

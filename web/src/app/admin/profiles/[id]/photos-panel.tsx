'use client';

import { StampButton } from '@/components/admin-ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

type Photo = { id: string };

export function ProfilePhotos({
  profileId,
  photos,
}: {
  profileId: string;
  photos: Photo[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function refreshSoon() {
    router.refresh();
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy('upload');
    setMessage('');
    const form = new FormData();
    for (const file of Array.from(files)) form.append('photos', file);
    const response = await fetch(`/api/profiles/${profileId}/photos`, {
      method: 'POST',
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (inputRef.current) inputRef.current.value = '';
    if (!response.ok && response.status !== 207) {
      setMessage(data.error ?? '사진 업로드에 실패했습니다.');
      return;
    }
    if (data.failed?.length) {
      setMessage(`사진 ${data.failed.length}장이 실패했습니다: ${data.failed[0].reason}`);
    }
    await refreshSoon();
  }

  async function onDelete(photoId: string) {
    if (!confirm('이 사진을 삭제할까요?')) return;
    setBusy(`del-${photoId}`);
    setMessage('');
    const response = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (!response.ok) {
      setMessage(data.error ?? '사진 삭제에 실패했습니다.');
      return;
    }
    await refreshSoon();
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-muted-on-card">사진</h3>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-on-card">사진이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${photo.id}`}
                alt=""
                className="h-36 w-36 rounded-[8px] border-2 border-edge object-cover"
              />
              <StampButton
                tone="red"
                className="absolute right-1 bottom-1 min-h-8 px-2 py-1 text-[11px]"
                disabled={!!busy}
                onClick={() => onDelete(photo.id)}
              >
                {busy === `del-${photo.id}` ? '…' : '삭제'}
              </StampButton>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="text-sm text-muted-on-card"
          disabled={!!busy}
          onChange={(e) => onUpload(e.target.files)}
        />
        {busy === 'upload' && <span className="text-sm text-fog-muted">올리는 중…</span>}
      </div>
      {message && <p className="text-sm font-bold text-yellow">{message}</p>}
    </div>
  );
}

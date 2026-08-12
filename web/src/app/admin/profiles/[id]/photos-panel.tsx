'use client';

import { StampButton } from '@/components/admin-ui';
import { cn } from '@/lib/ui';
import {
  ALLOWED_TYPES,
  MAX_BATCH_BYTES,
  MAX_BYTES,
  MAX_PHOTOS_PER_PROFILE,
  formatMb,
} from '@/lib/limits';
import { screenPhotoBatch } from '@/lib/photo-batch';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

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
  const inputId = useId();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const atLimit = photos.length >= MAX_PHOTOS_PER_PROFILE;
  const locked = atLimit || !!busy;

  async function onUpload(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    // 형식·용량·장수를 서버로 보내기 전에 걸러낸다. 특히 배치 합계는 서버가
    // "요청 본문을 읽을 수 없습니다" 같은 뭉뚱그린 400으로만 알려줘서,
    // 여기서 잡지 않으면 어느 사진이 문제인지 알 수 없다.
    const { accepted, rejections } = screenPhotoBatch(Array.from(fileList), photos.length);
    if (inputRef.current) inputRef.current.value = '';

    if (accepted.length === 0) {
      setMessage(rejections.join(' / ') || '올릴 수 있는 사진이 없습니다.');
      return;
    }

    setBusy('upload');
    setMessage('');
    const form = new FormData();
    for (const file of accepted) form.append('photos', file);
    const response = await fetch(`/api/profiles/${profileId}/photos`, {
      method: 'POST',
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    setBusy('');
    if (!response.ok && response.status !== 207) {
      setMessage(data.error ?? '사진 업로드에 실패했습니다.');
      return;
    }

    const notes = [...rejections];
    if (data.failed?.length) {
      notes.push(`사진 ${data.failed.length}장이 실패했습니다: ${data.failed[0].reason}`);
    }
    setMessage(notes.join(' / '));
    router.refresh();
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
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-muted-on-card">
        사진 ({photos.length}/{MAX_PHOTOS_PER_PROFILE}장)
      </h3>

      {photos.length === 0 ? (
        <p className="text-sm text-muted-on-card">사진이 없습니다.</p>
      ) : (
        <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-2">
              {/* 갤러리 셀에 원본을 그대로 내려보내던 문제 — 표시 폭보다 넉넉히 큰 리사이즈
                  변형을 요청한다. 사진이 최대 10장이라 lazy로 미룬다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${photo.id}?w=500`}
                alt={`받은 사진 ${index + 1}`}
                loading="lazy"
                className="aspect-square w-full rounded-[10px] border-2 border-edge object-cover"
              />
              <StampButton
                tone="red"
                className="min-h-8 px-2 py-1 text-[11px]"
                disabled={!!busy}
                onClick={() => onDelete(photo.id)}
                aria-label={`${index + 1}번째 사진 삭제`}
              >
                {busy === `del-${photo.id}` ? '…' : '삭제'}
              </StampButton>
            </li>
          ))}
        </ul>
      )}

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!locked) setIsDragging(true);
        }}
        // 자식(span, input) 위로 커서가 넘어갈 때도 dragleave가 올라와 하이라이트가
        // 떨린다. label 바깥으로 실제로 나갔을 때만 끈다.
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!locked) onUpload(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed px-4 py-6 text-center transition-colors',
          // 파일 input이 sr-only라 :focus-visible 아웃라인이 1px 박스에 그려진다.
          // 키보드 포커스를 드롭존 테두리로 끌어올린다.
          'has-[:focus-visible]:border-yellow has-[:focus-visible]:text-yellow',
          locked
            ? 'cursor-not-allowed border-edge text-muted-on-card/60'
            : isDragging
              ? 'cursor-pointer border-yellow bg-ink-elevated text-yellow'
              : 'cursor-pointer border-edge text-muted-on-card hover:border-fog-muted hover:text-fog'
        )}
      >
        <span className="text-sm font-bold">
          {atLimit ? (
            `최대 ${MAX_PHOTOS_PER_PROFILE}장을 모두 채웠어요`
          ) : busy === 'upload' ? (
            '올리는 중…'
          ) : (
            <>
              {/* 터치 기기엔 파일 드래그&드롭 자체가 없다. pointer:coarse에서는
                  "끌어다 놓기" 언급을 빼고 탭 안내만 보여준다. */}
              <span className="hidden [@media(pointer:coarse)]:inline">
                사진을 눌러서 선택하세요
              </span>
              <span className="[@media(pointer:coarse)]:hidden">
                사진을 여기로 끌어다 놓거나 클릭해서 선택하세요
              </span>
            </>
          )}
        </span>
        <span className="text-xs">
          JPG · PNG · WebP · 장당 {formatMb(MAX_BYTES)} · 한 번에 {formatMb(MAX_BATCH_BYTES)}까지
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          className="sr-only"
          disabled={locked}
          onChange={(e) => onUpload(e.target.files)}
        />
      </label>

      {message && <p className="text-sm font-bold text-yellow">{message}</p>}
    </div>
  );
}

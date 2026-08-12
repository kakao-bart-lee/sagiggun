'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { AdminTopBar, Panel, StampButton } from '@/components/admin-ui';
import { cn, withAtPrefix } from '@/lib/ui';
import {
  ALLOWED_TYPES,
  MAX_BATCH_BYTES,
  MAX_BYTES,
  MAX_PHOTOS_PER_PROFILE,
  formatMb,
} from '@/lib/limits';
import { screenPhotoBatch } from '@/lib/photo-batch';

/** 담아둔 사진. id는 미리보기 key 안정화를 위해 담는 시점에 부여한다. */
type PickedPhoto = { id: string; file: File };

export default function NewProfilePage() {
  const router = useRouter();
  const [sourceHandle, setHandle] = useState('');
  const [rawText, setRawText] = useState('');
  const [files, setFiles] = useState<PickedPhoto[]>([]);
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
      setMessage(
        `같은 스레드 아이디의 프로필이 ${data.duplicates.length}건 있습니다. 확인해 주세요.`
      );
      needsAttention = true;
    }

    if (files.length > 0) {
      const form = new FormData();
      for (const picked of files) form.append('photos', picked.file);
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
            <span className="text-sm font-bold text-muted-on-card">스레드 아이디</span>
            <input
              value={sourceHandle}
              onChange={(e) => setHandle(withAtPrefix(e.target.value))}
              placeholder="@minsu_92"
              required
              className="rounded-[8px] border-2 border-edge bg-field p-3 text-on-card"
            />
            <span className="text-xs text-fog-muted">
              스레드 프로필 링크의 @ 뒤에 오는 아이디예요. 예) threads.com/@minsu_92 → minsu_92
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-muted-on-card">받은 자기소개글</span>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={12}
              required
              placeholder="스레드 DM으로 받은 자기소개 원문을 그대로 붙여넣어 주세요."
              className="rounded-[8px] border-2 border-edge bg-field p-3 font-mono text-sm leading-snug text-on-card"
            />
          </label>

          <PhotoDropZone files={files} onFilesChange={setFiles} />

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

function PhotoDropZone({
  files,
  onFilesChange,
}: {
  files: PickedPhoto[];
  onFilesChange: (files: PickedPhoto[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const inputId = useId();
  const atLimit = files.length >= MAX_PHOTOS_PER_PROFILE;

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;

    // 같은 파일을 두 번 고르면 두 번 업로드된다. name+size+lastModified로 걸러낸다.
    const seen = new Set(files.map((p) => fingerprint(p.file)));
    const incoming: File[] = [];
    let duplicates = 0;
    for (const file of Array.from(list)) {
      const key = fingerprint(file);
      if (seen.has(key)) {
        duplicates += 1;
        continue;
      }
      seen.add(key);
      incoming.push(file);
    }

    const { accepted, rejections } = screenPhotoBatch(incoming, files.length);
    if (duplicates > 0) rejections.unshift(`이미 담긴 사진 ${duplicates}장은 건너뛰었어요`);
    setNotice(rejections.join(' / '));
    if (accepted.length === 0) return;

    onFilesChange([
      ...files,
      // 인덱스 기반 key를 쓰면 중간을 지울 때 뒤쪽 전부가 remount되어 미리보기가
      // 깜빡인다. 담는 시점에 안정적인 id를 부여한다.
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }

  function removeFile(id: string) {
    setNotice('');
    onFilesChange(files.filter((p) => p.id !== id));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-muted-on-card">
        사진 ({files.length}/{MAX_PHOTOS_PER_PROFILE}장)
      </span>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!atLimit) setIsDragging(true);
        }}
        // 자식(span, input) 위로 커서가 넘어갈 때도 dragleave가 올라와 하이라이트가
        // 떨린다. label 바깥으로 실제로 나갔을 때만 끈다.
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!atLimit) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed px-4 py-8 text-center transition-colors',
          // 파일 input이 sr-only라 :focus-visible 아웃라인이 1px 박스에 그려진다.
          // 키보드 포커스를 드롭존 테두리로 끌어올린다.
          'has-[:focus-visible]:border-yellow has-[:focus-visible]:text-yellow',
          atLimit
            ? 'cursor-not-allowed border-edge text-muted-on-card/60'
            : isDragging
              ? 'cursor-pointer border-yellow bg-ink-elevated text-yellow'
              : 'cursor-pointer border-edge text-muted-on-card hover:border-fog-muted hover:text-fog'
        )}
      >
        <span className="text-sm font-bold">
          {atLimit
            ? `최대 ${MAX_PHOTOS_PER_PROFILE}장을 모두 담았어요`
            : '사진을 여기로 끌어다 놓거나 클릭해서 선택하세요'}
        </span>
        <span className="text-xs">
          JPG · PNG · WebP · 장당 {formatMb(MAX_BYTES)} · 한 번에 {formatMb(MAX_BATCH_BYTES)}까지
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={ALLOWED_TYPES.join(',')}
          disabled={atLimit}
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {notice && <span className="text-xs font-bold text-telop-red">{notice}</span>}

      {files.length > 0 && (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {files.map((picked, index) => (
            <li key={picked.id}>
              <PhotoPreviewThumb
                file={picked.file}
                index={index}
                onRemove={() => removeFile(picked.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function PhotoPreviewThumb({
  file,
  index,
  onRemove,
}: {
  file: File;
  index: number;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="relative">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-20 w-20 rounded-[8px] border-2 border-edge object-cover" />
      ) : (
        <div className="h-20 w-20 rounded-[8px] border-2 border-edge bg-thumb" />
      )}
      <StampButton
        type="button"
        tone="red"
        className="absolute -bottom-1 -right-1 min-h-6 px-1.5 py-0.5 text-[10px]"
        onClick={onRemove}
        aria-label={`${index + 1}번째 사진 삭제 (${file.name})`}
      >
        삭제
      </StampButton>
    </div>
  );
}

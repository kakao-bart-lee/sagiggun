'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/ui';
import {
  ALLOWED_TYPES,
  MAX_BATCH_BYTES,
  MAX_BYTES,
  MAX_PHOTOS_PER_PROFILE,
  formatMb,
} from '@/lib/limits';
import { screenPhotoBatch } from '@/lib/photo-batch';

const fieldClass = 'rounded-[8px] border-2 border-edge bg-field p-3 text-sm text-on-card';
const labelClass = 'text-xs font-bold text-muted-on-card';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border-2 border-edge bg-card p-5 text-on-card">
      <h2 className="mb-4 text-base font-extrabold">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function ApplyForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // 폼 전체가 이름(name) 속성으로 읽는 비제어(uncontrolled) 입력이라, 드롭존이 골라둔
  // 파일도 실제 <input type="file" name="photos">의 .files에 반영해야 submit 시
  // new FormData(formEl)가 이 사진들을 함께 집어간다.
  function syncPhotoInput(files: File[]) {
    const dt = new DataTransfer();
    for (const file of files) dt.items.add(file);
    if (photoInputRef.current) photoInputRef.current.files = dt.files;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    const submittedPhotos = form.getAll('photos').filter((v) => v instanceof File && v.size > 0);
    if (submittedPhotos.length < 2) {
      setError('사진을 2장 이상 올려주세요.');
      return;
    }

    setBusy(true);
    setError('');
    const res = await fetch('/api/public/apply', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? '신청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-[12px] border-2 border-edge bg-card p-6 text-sm font-bold leading-relaxed text-on-card">
        신청이 접수됐어요! 🎉
        <br />
        주인장이 내용을 확인하고 소개글을 다듬어 게시한 뒤, 스레드 DM으로 알려드릴게요.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <Section title="누구를 소개할까요?">
        {/* 라디오 라벨의 탭 영역이 텍스트 줄높이(20px)뿐이라 WCAG 2.5.8 최소(24px) 미달이었다.
            세로 패딩을 더해 시각적 크기는 거의 그대로 두고 탭 영역만 넓힌다. */}
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 py-1">
            <input type="radio" name="applicantType" value="SELF" defaultChecked /> 본인
          </label>
          <label className="flex items-center gap-2 py-1">
            <input type="radio" name="applicantType" value="FRIEND" /> 친구 대신 신청
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>연락받을 스레드 아이디 (필수)</span>
          <input name="handle" className={fieldClass} placeholder="@my_threads" maxLength={60} required />
        </label>
      </Section>

      <Section title="🤍 본인 소개">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>성별</span>
            <select name="gender" className={fieldClass} required>
              <option value="">선택</option>
              <option value="F">여성</option>
              <option value="M">남성</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>출생연도</span>
            <input
              name="birthYear"
              className={fieldClass}
              inputMode="numeric"
              placeholder="2000"
              pattern="[0-9]{4}"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>키(cm)</span>
            <input
              name="heightCm"
              className={fieldClass}
              inputMode="numeric"
              placeholder="173"
              pattern="[0-9]{3}"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>지역</span>
            <input name="region" className={fieldClass} placeholder="수원" maxLength={100} required />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>직업</span>
          <input name="job" className={fieldClass} placeholder="직장인" maxLength={100} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>취미 (콤마로 구분)</span>
          <input
            name="hobbies"
            className={fieldClass}
            placeholder="운동, 야구 관람, 사진 찍기"
            maxLength={500}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>본인 어필 1 (필수)</span>
          <input name="appeal1" className={fieldClass} placeholder="다정하다" maxLength={300} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>본인 어필 2</span>
          <input name="appeal2" className={fieldClass} placeholder="연락이 빠르다" maxLength={300} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>본인 어필 3</span>
          <input name="appeal3" className={fieldClass} placeholder="안정형이다" maxLength={300} />
        </label>
        <PhotoDropZoneField
          photos={photos}
          inputRef={photoInputRef}
          onPhotosChange={(next) => {
            setPhotos(next);
            syncPhotoInput(next);
          }}
        />
      </Section>

      <Section title="💛 원하는 이상형">
        <label className="flex flex-col gap-1">
          <span className={labelClass}>키</span>
          <input name="idealHeight" className={fieldClass} placeholder="ex. 175 이상" maxLength={200} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>얼굴 느낌</span>
          <input
            name="idealVibe"
            className={fieldClass}
            placeholder="ex. 두부, 강아지, 고양이, 토끼상 등"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>내적 (성격, 취미 등)</span>
          <input
            name="idealInner"
            className={fieldClass}
            placeholder="ex. 다정하고 연락 잘 되는 분"
            maxLength={300}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>나이차이</span>
          <input
            name="idealAgeGap"
            className={fieldClass}
            placeholder="ex. 위로 2살, 아래로 3살 가능"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>가능한 지역이나 거리 (콤마로 구분)</span>
          <input
            name="idealRegions"
            className={fieldClass}
            placeholder="ex. 경기 남부, 서울"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>이건 절대 안 돼요 (콤마로 구분)</span>
          <input
            name="dealBreakers"
            className={fieldClass}
            placeholder="ex. 흡연, 심한 문신"
            maxLength={300}
          />
        </label>
      </Section>

      <Section title="확인해 주세요">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="adultConfirmed" required className="mt-0.5" />
          <span>성인입니다. 미성년자가 아님을 확인합니다. (필수)</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="privacyConsented" required className="mt-0.5" />
          <span>
            입력한 정보와 사진을 소개 목적으로 수집·이용하는 데 동의합니다. 연결이 끝나거나
            요청하면 삭제됩니다. (필수)
          </span>
        </label>
      </Section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 items-center justify-center rounded-[10px] border-2 border-yellow bg-ink-elevated px-6 py-3 text-[15px] font-bold text-yellow shadow-[0_0_0_2px_var(--ink),0_0_0_4px_var(--yellow)] hover:bg-yellow hover:text-ink disabled:opacity-40"
        >
          {busy ? '신청 중…' : '신청하기'}
        </button>
        {error && <p className="text-sm font-bold text-telop-red">{error}</p>}
      </div>
    </form>
  );
}

/**
 * 관리 화면 두 곳(새 프로필, 프로필 상세 사진 갤러리)엔 드래그&드롭 업로드가 있는데
 * 공개 신청 폼만 기본 파일 입력(283x48, 드롭 불가)이었다 — 같은 작업에 다른 어포던스.
 * 여기서는 폼 전체가 name 속성으로 읽는 비제어 입력이라, 고른 파일을 실제 file input의
 * .files에 동기화해 form.getAll('photos')가 그대로 집어가게 한다(부모의 syncPhotoInput).
 */
function PhotoDropZoneField({
  photos,
  inputRef,
  onPhotosChange,
}: {
  photos: File[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPhotosChange: (photos: File[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const inputId = useId();
  const atLimit = photos.length >= MAX_PHOTOS_PER_PROFILE;

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const { accepted, rejections } = screenPhotoBatch(Array.from(list), photos.length);
    setNotice(rejections.join(' / '));
    if (accepted.length === 0) return;
    onPhotosChange([...photos, ...accepted]);
  }

  function removePhoto(index: number) {
    setNotice('');
    onPhotosChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>사진 2장 이상 (주인장만 확인)</span>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!atLimit) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!atLimit) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-[8px] border-2 border-dashed px-4 py-6 text-center transition-colors',
          'has-[:focus-visible]:border-yellow has-[:focus-visible]:text-yellow',
          atLimit
            ? 'cursor-not-allowed border-edge text-muted-on-card/60'
            : isDragging
              ? 'cursor-pointer border-yellow bg-ink-elevated text-yellow'
              : 'cursor-pointer border-edge text-muted-on-card hover:border-fog-muted hover:text-fog'
        )}
      >
        <span className="text-sm font-bold">
          {atLimit ? (
            `최대 ${MAX_PHOTOS_PER_PROFILE}장을 모두 담았어요`
          ) : (
            <>
              {/* 터치 기기엔 파일 드래그&드롭 자체가 없다. 공개 신청 폼은 대부분 모바일로
                  채우니 여기서 특히 중요하다. pointer:coarse에서는 "끌어다 놓기" 언급을
                  빼고 탭 안내만 보여준다. */}
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
          {photos.length}/{MAX_PHOTOS_PER_PROFILE}장 · JPG · PNG · WebP · 장당{' '}
          {formatMb(MAX_BYTES)} · 한 번에 {formatMb(MAX_BATCH_BYTES)}까지
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          name="photos"
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

      {photos.length > 0 && (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {photos.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
              <PhotoThumb file={file} index={index} onRemove={() => removePhoto(index)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PhotoThumb({
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
        <img
          src={url}
          alt={`선택한 사진 ${index + 1}`}
          className="h-20 w-20 rounded-[8px] border-2 border-edge object-cover"
        />
      ) : (
        <div className="h-20 w-20 rounded-[8px] border-2 border-edge bg-thumb" />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${index + 1}번째 사진 삭제 (${file.name})`}
        className="absolute -bottom-1 -right-1 inline-flex min-h-6 items-center justify-center rounded-[6px] border-2 border-telop-red bg-ink-elevated px-1.5 py-0.5 text-[10px] font-bold text-telop-red hover:bg-telop-red hover:text-ink"
      >
        삭제
      </button>
    </div>
  );
}

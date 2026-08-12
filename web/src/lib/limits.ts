/**
 * 사진 업로드 상한. 클라이언트(드롭존)와 서버(storage.ts) 양쪽에서 쓴다.
 *
 * storage.ts는 `node:fs`와 `@/lib/env`를 import하므로 클라이언트 컴포넌트가
 * 직접 가져올 수 없다. 그래서 상한만 이 파일로 분리해 두 곳이 같은 값을 보게 한다.
 */
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const MAX_BYTES = 10 * 1024 * 1024;

export const MAX_PHOTOS_PER_PROFILE = 10;

/**
 * 한 요청에 담을 수 있는 본문 크기의 실질 상한.
 *
 * 전역 미들웨어가 `/api/:path*`에 걸려 있어 Next가 요청 본문을 통째로 버퍼링하고,
 * 기본 상한(~10MB)을 넘으면 `formData()` 자체가 던진다. 즉 파일 하나하나가
 * MAX_BYTES를 통과해도 배치 합계가 이 값을 넘으면 업로드 전체가 실패한다.
 * 여유를 조금 둬서 클라이언트에서 미리 걸러낸다.
 */
export const MAX_BATCH_BYTES = 9 * 1024 * 1024;

export function isAllowedImageType(type: string): boolean {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

/** 사진 리사이즈 변형(`/api/photos/[id]?w=`)에 허용하는 폭 범위. */
export const MIN_PHOTO_WIDTH = 64;
export const MAX_PHOTO_WIDTH = 800;

/** ?w= 요청값을 안전한 범위로 자른다. 원본보다 키우거나 무한대로 늘리지 못하게 한다. */
export function clampPhotoWidth(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_PHOTO_WIDTH, Math.max(MIN_PHOTO_WIDTH, Math.round(n)));
}

/** 사람이 읽는 크기 문자열 — 오류 메시지에 쓴다. */
export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

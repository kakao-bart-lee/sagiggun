import {
  MAX_BATCH_BYTES,
  MAX_BYTES,
  MAX_PHOTOS_PER_PROFILE,
  formatMb,
  isAllowedImageType,
} from '@/lib/limits';

/** 드롭존이 서버로 보내기 전에 걸러낸 결과. */
export type PhotoBatchScreening = {
  accepted: File[];
  /** 사용자에게 보여줄 거부 사유. 비어 있으면 전부 통과. */
  rejections: string[];
};

/** File 대신 최소 필드만 요구해 테스트에서 가짜 객체를 쓸 수 있게 한다. */
type FileLike = { name: string; size: number; type: string };

/**
 * 형식 → 파일별 용량 → 남은 장수 → 배치 합계 순으로 걸러낸다.
 *
 * 서버도 같은 상한을 검사하지만(storage.ts assertUploadable), 두 가지는 서버 응답만으로는
 * 사용자가 원인을 알 수 없다:
 *  - 배치 합계 초과: 전역 미들웨어 때문에 `formData()`가 던져서 뭉뚱그린 400만 돌아온다.
 *  - drag-and-drop: `accept` 속성은 파일 피커만 필터하고 드롭에는 적용되지 않는다.
 */
export function screenPhotoBatch<T extends FileLike>(
  files: T[],
  existingCount: number
): { accepted: T[]; rejections: string[] } {
  const rejections: string[] = [];

  const typeOk: T[] = [];
  const badType: T[] = [];
  for (const file of files) {
    if (isAllowedImageType(file.type)) typeOk.push(file);
    else badType.push(file);
  }
  if (badType.length > 0) {
    rejections.push(
      `이미지가 아닌 파일 ${badType.length}개는 제외했어요 (${badType[0].name})`
    );
  }

  const sizeOk: T[] = [];
  const tooBig: T[] = [];
  for (const file of typeOk) {
    if (file.size > MAX_BYTES) tooBig.push(file);
    else sizeOk.push(file);
  }
  if (tooBig.length > 0) {
    rejections.push(
      `장당 ${formatMb(MAX_BYTES)}을 넘는 ${tooBig.length}장은 제외했어요 (${tooBig[0].name})`
    );
  }

  const room = Math.max(MAX_PHOTOS_PER_PROFILE - existingCount, 0);
  const withinCount = sizeOk.slice(0, room);
  if (sizeOk.length > room) {
    rejections.push(
      `최대 ${MAX_PHOTOS_PER_PROFILE}장까지만 담을 수 있어 ${sizeOk.length - room}장은 제외했어요`
    );
  }

  const accepted: T[] = [];
  let total = 0;
  let droppedForBatch = 0;
  for (const file of withinCount) {
    if (total + file.size > MAX_BATCH_BYTES) {
      droppedForBatch += 1;
      continue;
    }
    total += file.size;
    accepted.push(file);
  }
  if (droppedForBatch > 0) {
    rejections.push(
      `한 번에 ${formatMb(MAX_BATCH_BYTES)}까지만 올릴 수 있어 ${droppedForBatch}장은 제외했어요. 나눠서 올려주세요`
    );
  }

  return { accepted, rejections };
}

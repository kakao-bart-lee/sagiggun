import fs from 'node:fs/promises';
import path from 'node:path';
import { getEnv } from '@/lib/env';

// 상한은 클라이언트 드롭존과 공유해야 하므로 @/lib/limits가 단일 출처다.
// 기존 import 경로를 깨지 않기 위해 여기서 그대로 re-export한다.
export {
  ALLOWED_TYPES,
  MAX_BYTES,
  MAX_PHOTOS_PER_PROFILE,
} from '@/lib/limits';

import { ALLOWED_TYPES, MAX_BYTES, MAX_PHOTOS_PER_PROFILE } from '@/lib/limits';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function baseDirOf(override?: string): string {
  return path.resolve(override ?? getEnv().photoDir);
}

// storageKey는 우리가 만들지만, DB를 거쳐 돌아온 값도 검증한다.
// 해석된 경로가 기준 디렉터리 밖이면 거부한다.
function resolveKey(storageKey: string, baseDir: string): string {
  const full = path.resolve(baseDir, storageKey);
  const prefix = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (full !== baseDir && !full.startsWith(prefix)) {
    throw new Error(`저장 경로가 허용 범위를 벗어났습니다: ${storageKey}`);
  }
  return full;
}

export function assertUploadable(
  contentType: string,
  bytes: number,
  existingCount: number
): void {
  if (!(ALLOWED_TYPES as readonly string[]).includes(contentType)) {
    throw new Error(`지원하지 않는 이미지 형식입니다: ${contentType}`);
  }
  if (bytes > MAX_BYTES) {
    throw new Error(`사진 크기가 제한(10MB)을 넘습니다.`);
  }
  if (existingCount >= MAX_PHOTOS_PER_PROFILE) {
    throw new Error(`사진은 프로필당 최대 ${MAX_PHOTOS_PER_PROFILE}장까지 올릴 수 있습니다.`);
  }
}

async function gcsBucket() {
  const name = getEnv().photoBucket;
  if (!name) return null;
  const { Storage } = await import('@google-cloud/storage');
  return new Storage().bucket(name);
}

export async function putPhoto(
  profileId: string,
  data: Uint8Array,
  contentType: string,
  baseDir?: string
): Promise<string> {
  const ext = EXTENSION[contentType];
  if (!ext) throw new Error(`지원하지 않는 이미지 형식입니다: ${contentType}`);

  const key = `${profileId}/${crypto.randomUUID()}.${ext}`;
  const bucket = await gcsBucket();
  if (bucket) {
    await bucket.file(key).save(Buffer.from(data), {
      contentType,
      resumable: false,
      metadata: { cacheControl: 'private, max-age=3600' },
    });
    return key;
  }

  const root = baseDirOf(baseDir);
  const full = resolveKey(key, root);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return key;
}

export async function readPhoto(storageKey: string, baseDir?: string): Promise<Uint8Array> {
  const bucket = await gcsBucket();
  if (bucket) {
    const [buf] = await bucket.file(storageKey).download();
    return new Uint8Array(buf);
  }
  const full = resolveKey(storageKey, baseDirOf(baseDir));
  return new Uint8Array(await fs.readFile(full));
}

export async function removePhoto(storageKey: string, baseDir?: string): Promise<void> {
  const bucket = await gcsBucket();
  if (bucket) {
    await bucket.file(storageKey).delete({ ignoreNotFound: true });
    return;
  }
  const full = resolveKey(storageKey, baseDirOf(baseDir));
  await fs.rm(full, { force: true });
}

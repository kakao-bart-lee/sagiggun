import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  putPhoto,
  readPhoto,
  removePhoto,
  assertUploadable,
  MAX_BYTES,
  MAX_PHOTOS_PER_PROFILE,
} from '@/lib/storage';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'photos-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const bytes = new Uint8Array([1, 2, 3, 4]);

describe('putPhoto / readPhoto', () => {
  it('저장한 내용을 그대로 읽는다', async () => {
    const key = await putPhoto('prof1', bytes, 'image/png', dir);
    expect(await readPhoto(key, dir)).toEqual(bytes);
  });

  it('저장 키는 프로필 id로 시작하고 확장자가 붙는다', async () => {
    const key = await putPhoto('prof1', bytes, 'image/webp', dir);
    expect(key.startsWith('prof1/')).toBe(true);
    expect(key.endsWith('.webp')).toBe(true);
  });

  it('같은 프로필에 두 번 저장해도 키가 겹치지 않는다', async () => {
    const a = await putPhoto('prof1', bytes, 'image/png', dir);
    const b = await putPhoto('prof1', bytes, 'image/png', dir);
    expect(a).not.toBe(b);
  });
});

describe('removePhoto', () => {
  it('파일을 지운다', async () => {
    const key = await putPhoto('prof1', bytes, 'image/png', dir);
    await removePhoto(key, dir);
    await expect(readPhoto(key, dir)).rejects.toThrow();
  });

  it('없는 파일을 지워도 던지지 않는다', async () => {
    await expect(removePhoto('prof1/nope.png', dir)).resolves.toBeUndefined();
  });
});

describe('경로 탈출 차단', () => {
  it('상위 디렉터리로 나가는 키를 거부한다', async () => {
    await expect(readPhoto('../secret.txt', dir)).rejects.toThrow(/경로/);
    await expect(removePhoto('../secret.txt', dir)).rejects.toThrow(/경로/);
  });

  it('절대경로 키를 거부한다', async () => {
    await expect(readPhoto('/etc/passwd', dir)).rejects.toThrow(/경로/);
  });
});

describe('assertUploadable', () => {
  it('허용된 형식은 통과한다', () => {
    expect(() => assertUploadable('image/jpeg', 1000, 0)).not.toThrow();
  });

  it('허용되지 않은 형식을 거부한다', () => {
    expect(() => assertUploadable('application/pdf', 1000, 0)).toThrow(/형식/);
    expect(() => assertUploadable('image/gif', 1000, 0)).toThrow(/형식/);
  });

  it('크기 제한을 넘으면 거부한다', () => {
    expect(() => assertUploadable('image/png', MAX_BYTES + 1, 0)).toThrow(/크기/);
  });

  it('장수 제한에 도달하면 거부한다', () => {
    expect(() => assertUploadable('image/png', 1000, MAX_PHOTOS_PER_PROFILE)).toThrow(/장/);
    expect(() => assertUploadable('image/png', 1000, MAX_PHOTOS_PER_PROFILE - 1)).not.toThrow();
  });
});

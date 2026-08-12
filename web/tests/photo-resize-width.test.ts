import { describe, it, expect } from 'vitest';
import { clampPhotoWidth, MIN_PHOTO_WIDTH, MAX_PHOTO_WIDTH } from '@/lib/limits';

describe('clampPhotoWidth', () => {
  it('요청이 없으면 리사이즈하지 않는다 (원본 그대로)', () => {
    expect(clampPhotoWidth(null)).toBeNull();
  });

  it('빈 문자열도 요청 없음으로 본다', () => {
    expect(clampPhotoWidth('')).toBeNull();
  });

  it('숫자가 아니면 요청 없음으로 본다 — 깨진 쿼리로 리사이즈를 강제하지 못한다', () => {
    expect(clampPhotoWidth('abc')).toBeNull();
    expect(clampPhotoWidth('NaN')).toBeNull();
  });

  it('범위 안의 값은 그대로 쓴다', () => {
    expect(clampPhotoWidth('300')).toBe(300);
  });

  it('최소값 아래는 최소값으로 올린다', () => {
    expect(clampPhotoWidth('1')).toBe(MIN_PHOTO_WIDTH);
    expect(clampPhotoWidth('0')).toBe(MIN_PHOTO_WIDTH);
  });

  it('최대값 위는 최대값으로 내린다 — 무제한 리사이즈 요청으로 서버를 못 잡아먹는다', () => {
    expect(clampPhotoWidth('99999')).toBe(MAX_PHOTO_WIDTH);
  });

  it('음수는 최소값으로 올린다', () => {
    expect(clampPhotoWidth('-50')).toBe(MIN_PHOTO_WIDTH);
  });

  it('소수는 정수로 반올림한다', () => {
    expect(clampPhotoWidth('300.6')).toBe(301);
  });
});

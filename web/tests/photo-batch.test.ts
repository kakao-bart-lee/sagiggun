import { describe, it, expect } from 'vitest';
import { screenPhotoBatch } from '@/lib/photo-batch';
import { MAX_BATCH_BYTES, MAX_BYTES, MAX_PHOTOS_PER_PROFILE } from '@/lib/limits';

const MB = 1024 * 1024;

function f(name: string, sizeMb: number, type = 'image/jpeg') {
  return { name, size: Math.round(sizeMb * MB), type };
}

describe('screenPhotoBatch', () => {
  it('정상 이미지는 그대로 통과시킨다', () => {
    const { accepted, rejections } = screenPhotoBatch([f('a.jpg', 1), f('b.png', 1)], 0);
    expect(accepted).toHaveLength(2);
    expect(rejections).toEqual([]);
  });

  it('이미지가 아닌 파일을 걸러낸다 — accept 속성은 드롭에 적용되지 않는다', () => {
    const { accepted, rejections } = screenPhotoBatch(
      [f('doc.pdf', 1, 'application/pdf'), f('ok.jpg', 1)],
      0
    );
    expect(accepted.map((x) => x.name)).toEqual(['ok.jpg']);
    expect(rejections.join()).toMatch(/이미지가 아닌/);
    expect(rejections.join()).toContain('doc.pdf');
  });

  it('파일별 용량 상한을 넘는 사진을 걸러낸다', () => {
    const over = { name: 'big.jpg', size: MAX_BYTES + 1, type: 'image/jpeg' };
    const { accepted, rejections } = screenPhotoBatch([over, f('ok.jpg', 1)], 0);
    expect(accepted.map((x) => x.name)).toEqual(['ok.jpg']);
    expect(rejections.join()).toContain('big.jpg');
  });

  it('남은 장수만큼만 받고 초과분을 알려준다', () => {
    const files = Array.from({ length: 4 }, (_, i) => f(`p${i}.jpg`, 0.1));
    const { accepted, rejections } = screenPhotoBatch(files, MAX_PHOTOS_PER_PROFILE - 2);
    expect(accepted).toHaveLength(2);
    expect(rejections.join()).toMatch(new RegExp(`${MAX_PHOTOS_PER_PROFILE}장`));
  });

  it('이미 상한을 채웠으면 아무것도 받지 않는다', () => {
    const { accepted } = screenPhotoBatch([f('a.jpg', 1)], MAX_PHOTOS_PER_PROFILE);
    expect(accepted).toEqual([]);
  });

  it('개별 파일은 합법이어도 배치 합계가 넘으면 잘라낸다', () => {
    // 4MB × 3 = 12MB — 각각은 10MB 미만이지만 합계가 미들웨어 버퍼 상한을 넘긴다.
    const files = [f('a.jpg', 4), f('b.jpg', 4), f('c.jpg', 4)];
    const { accepted, rejections } = screenPhotoBatch(files, 0);

    const total = accepted.reduce((sum, x) => sum + x.size, 0);
    expect(total).toBeLessThanOrEqual(MAX_BATCH_BYTES);
    expect(accepted.length).toBeLessThan(3);
    expect(rejections.join()).toMatch(/한 번에/);
  });

  it('배치 합계 안에 들어오면 여러 장을 모두 받는다', () => {
    const files = [f('a.jpg', 2), f('b.jpg', 2), f('c.jpg', 2)];
    const { accepted, rejections } = screenPhotoBatch(files, 0);
    expect(accepted).toHaveLength(3);
    expect(rejections).toEqual([]);
  });

  it('여러 사유가 겹치면 사유를 모두 모아 돌려준다', () => {
    const { rejections } = screenPhotoBatch(
      [f('doc.pdf', 1, 'application/pdf'), { name: 'big.jpg', size: MAX_BYTES + 1, type: 'image/png' }],
      0
    );
    expect(rejections).toHaveLength(2);
  });
});

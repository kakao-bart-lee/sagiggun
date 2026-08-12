import { describe, it, expect } from 'vitest';
import { withAtPrefix } from '@/lib/ui';
import { normalizeHandle } from '@/lib/inquiry/service';

describe('withAtPrefix', () => {
  it('@ 없이 입력하면 붙여준다', () => {
    expect(withAtPrefix('minsu_92')).toBe('@minsu_92');
  });

  it('이미 @가 있으면 그대로 둔다', () => {
    expect(withAtPrefix('@minsu_92')).toBe('@minsu_92');
  });

  it('@를 여러 번 쳐도 하나만 남긴다', () => {
    expect(withAtPrefix('@@@minsu_92')).toBe('@minsu_92');
  });

  it('비우면 빈 문자열로 둬서 placeholder가 보이게 한다', () => {
    expect(withAtPrefix('')).toBe('');
    expect(withAtPrefix('@')).toBe('');
  });

  it('앞쪽 공백은 정리한다', () => {
    expect(withAtPrefix('  minsu')).toBe('@minsu');
    expect(withAtPrefix('@  minsu')).toBe('@minsu');
  });

  it('반복 적용해도 결과가 같다 (onChange마다 호출되므로)', () => {
    const once = withAtPrefix('minsu');
    expect(withAtPrefix(once)).toBe(once);
  });

  it('서버의 normalizeHandle이 다시 @를 벗겨내므로 왕복이 안전하다', () => {
    for (const raw of ['minsu_92', '@minsu_92', '  minsu_92']) {
      expect(normalizeHandle(withAtPrefix(raw))).toBe('minsu_92');
    }
  });
});

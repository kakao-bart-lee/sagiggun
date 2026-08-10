import { describe, it, expect } from 'vitest';
import { ACTION_NEXT_STATUS, canTransition, isTerminal } from '@/lib/inquiry/state';

describe('inquiry 상태 전이', () => {
  it('수작업 흐름의 정방향 전이를 허용한다', () => {
    expect(canTransition('RECEIVED', 'SPEC_REQUESTED')).toBe(true);
    expect(canTransition('SPEC_REQUESTED', 'SPEC_RECEIVED')).toBe(true);
    expect(canTransition('SPEC_RECEIVED', 'FORWARDED')).toBe(true);
    expect(canTransition('FORWARDED', 'ACCEPTED')).toBe(true);
    expect(canTransition('FORWARDED', 'DECLINED')).toBe(true);
  });

  it('스펙이 이미 있으면 접수에서 바로 스펙 도착으로 갈 수 있다', () => {
    expect(canTransition('RECEIVED', 'SPEC_RECEIVED')).toBe(true);
  });

  it('역방향·건너뛰기 전이는 막는다', () => {
    expect(canTransition('SPEC_REQUESTED', 'RECEIVED')).toBe(false);
    expect(canTransition('RECEIVED', 'FORWARDED')).toBe(false);
    expect(canTransition('RECEIVED', 'ACCEPTED')).toBe(false);
    expect(canTransition('SPEC_RECEIVED', 'ACCEPTED')).toBe(false);
  });

  it('종결 상태에서는 어디로도 못 간다', () => {
    for (const from of ['ACCEPTED', 'DECLINED', 'CLOSED'] as const) {
      expect(isTerminal(from)).toBe(true);
      for (const to of Object.values(ACTION_NEXT_STATUS)) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('진행 중 어느 단계에서든 종료할 수 있다', () => {
    for (const from of ['RECEIVED', 'SPEC_REQUESTED', 'SPEC_RECEIVED', 'FORWARDED'] as const) {
      expect(canTransition(from, 'CLOSED')).toBe(true);
    }
  });
});

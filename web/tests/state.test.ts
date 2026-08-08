import { describe, it, expect } from 'vitest';
import {
  canApprove,
  canPublish,
  statusAfterEdit,
  statusAfterUnarchive,
} from '@/lib/profile/state';

describe('canApprove', () => {
  it('최종 문구가 있으면 승인할 수 있다', () => {
    expect(canApprove({ finalBody: '✨ 본문', status: 'DRAFTED' })).toEqual({ ok: true });
  });

  it('최종 문구가 없으면 거부하고 이유를 준다', () => {
    const result = canApprove({ finalBody: null, status: 'DRAFTED' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/문구/);
  });

  it('공백뿐인 문구는 없는 것으로 본다', () => {
    expect(canApprove({ finalBody: '   \n ', status: 'DRAFTED' }).ok).toBe(false);
  });

  it('보관된 프로필은 승인할 수 없다', () => {
    const result = canApprove({ finalBody: '✨ 본문', status: 'ARCHIVED' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/보관/);
  });
});

describe('canPublish', () => {
  it('APPROVED에서만 게시할 수 있다', () => {
    expect(canPublish({ status: 'APPROVED', finalBody: '✨ 본문' })).toEqual({ ok: true });
  });

  it('승인 전에는 게시할 수 없다', () => {
    for (const status of ['COLLECTED', 'DRAFTED', 'ARCHIVED'] as const) {
      const result = canPublish({ status, finalBody: '✨ 본문' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/승인/);
    }
  });

  it('이미 게시된 프로필은 다시 게시하지 않는다', () => {
    const result = canPublish({ status: 'PUBLISHED', finalBody: '✨ 본문' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/이미/);
  });
});

describe('statusAfterEdit', () => {
  it('승인 후 편집하면 초안으로 내려간다', () => {
    expect(statusAfterEdit('APPROVED')).toBe('DRAFTED');
  });

  it('초안 상태는 그대로 유지된다', () => {
    expect(statusAfterEdit('DRAFTED')).toBe('DRAFTED');
  });

  it('수집 상태는 그대로 유지된다', () => {
    expect(statusAfterEdit('COLLECTED')).toBe('COLLECTED');
  });

  it('게시된 프로필의 상태는 바꾸지 않는다', () => {
    expect(statusAfterEdit('PUBLISHED')).toBe('PUBLISHED');
  });
});

describe('statusAfterUnarchive', () => {
  it('초안이 있으면 DRAFTED로 돌아간다', () => {
    expect(statusAfterUnarchive({ draftBody: '✨ 본문' })).toBe('DRAFTED');
  });

  it('초안이 없으면 COLLECTED로 돌아간다', () => {
    expect(statusAfterUnarchive({ draftBody: null })).toBe('COLLECTED');
  });
});

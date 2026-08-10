import { describe, it, expect } from 'vitest';
import {
  connectBody,
  declineBody,
  specForwardBody,
  specRequestBody,
} from '@/lib/inquiry/templates';

describe('inquiry 문안 템플릿', () => {
  it('스펙 문의는 게시 번호와 양식을 담는다', () => {
    const body = specRequestBody(67);
    expect(body).toContain('67번');
    expect(body).toContain('사진 2장 이상');
    expect(body).toContain('본인 어필 3가지');
  });

  it('스펙 전달은 있는 사실만 줄로 만든다 — 빈 필드는 줄 자체가 없다', () => {
    const body = specForwardBody(67, {
      gender: 'M',
      birthYear: 2000,
      heightCm: 173,
      region: '수원',
      job: null,
      hobbies: ['운동', '야구 관람'],
      appealPoints: ['다정하다'],
    });
    expect(body).toContain('00년생 / 남성 / 173cm / 수원');
    expect(body).toContain('취미: 운동, 야구 관람');
    expect(body).toContain('1. 다정하다');
    expect(body).not.toContain('직업');
  });

  it('스펙 전달 — 아무 필드도 없으면 붙여넣기 안내를 남긴다', () => {
    const body = specForwardBody(null, {
      gender: null,
      birthYear: null,
      heightCm: null,
      region: null,
      job: null,
      hobbies: [],
      appealPoints: [],
    });
    expect(body).toContain('붙여주세요');
  });

  it('성사 안내는 상대 핸들을, 거절 안내는 번호를 담는다', () => {
    expect(connectBody('some_one')).toContain('@some_one');
    expect(declineBody(67)).toContain('67번');
    expect(declineBody(null)).toContain('해당');
  });
});

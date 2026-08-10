import { describe, it, expect } from 'vitest';
import {
  checkPublicSubmitLimit,
  checkRateLimit,
  getClientIp,
  recordLoginFailure,
  recordLoginSuccess,
} from '@/lib/rate-limit';

// 각 테스트가 서로 다른 key(IP)를 써서, 모듈 스코프의 Map을 테스트끼리 공유해도
// 간섭하지 않게 한다.
describe('rate-limit', () => {
  it('실패가 임계값(5회) 미만이면 막지 않는다', () => {
    const now = 1_700_000_000_000;
    const key = 'ip-a';
    for (let i = 0; i < 4; i += 1) recordLoginFailure(key, now + i);
    expect(checkRateLimit(key, now + 4).limited).toBe(false);
  });

  it('1분 안에 5회 실패하면 잠긴다', () => {
    const now = 1_700_000_100_000;
    const key = 'ip-b';
    for (let i = 0; i < 5; i += 1) recordLoginFailure(key, now + i);
    const result = checkRateLimit(key, now + 5);
    expect(result.limited).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('창(1분) 밖으로 벗어난 오래된 실패는 세지 않는다', () => {
    const key = 'ip-c';
    const start = 1_700_000_200_000;
    for (let i = 0; i < 4; i += 1) recordLoginFailure(key, start + i);
    // 10분 뒤에 1번 더 실패해도, 그 전 4번은 창 밖이라 이미 사라졌으므로 잠기지 않는다.
    recordLoginFailure(key, start + 10 * 60_000);
    expect(checkRateLimit(key, start + 10 * 60_000 + 1).limited).toBe(false);
  });

  it('로그인에 성공하면 실패 카운터가 초기화된다', () => {
    const now = 1_700_000_300_000;
    const key = 'ip-d';
    for (let i = 0; i < 4; i += 1) recordLoginFailure(key, now + i);
    recordLoginSuccess(key);
    recordLoginFailure(key, now + 10);
    expect(checkRateLimit(key, now + 11).limited).toBe(false);
  });

  it('잠금 시간(5분)이 지나면 다시 시도할 수 있다', () => {
    const now = 1_700_000_400_000;
    const key = 'ip-e';
    for (let i = 0; i < 5; i += 1) recordLoginFailure(key, now);
    expect(checkRateLimit(key, now + 5 * 60_000 - 1).limited).toBe(true); // 잠금 끝나기 1ms 전
    expect(checkRateLimit(key, now + 5 * 60_000 + 1).limited).toBe(false); // 5분 경과 후
  });

  it('x-forwarded-for의 첫 IP를 쓰고, 헤더가 없으면 unknown 버킷으로 묶는다', () => {
    const withHeader = new Request('http://localhost/x', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    });
    expect(getClientIp(withHeader)).toBe('203.0.113.9');

    const withoutHeader = new Request('http://localhost/x');
    expect(getClientIp(withoutHeader)).toBe('unknown');
  });
});

describe('공개 제출 rate limit', () => {
  it('분당 3회까지 허용하고 4번째는 막는다', () => {
    const now = 1_700_001_000_000;
    const key = 'pub-a';
    expect(checkPublicSubmitLimit(key, now).limited).toBe(false);
    expect(checkPublicSubmitLimit(key, now + 1).limited).toBe(false);
    expect(checkPublicSubmitLimit(key, now + 2).limited).toBe(false);
    const fourth = checkPublicSubmitLimit(key, now + 3);
    expect(fourth.limited).toBe(true);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it('창(1분)이 지나면 다시 허용한다', () => {
    const now = 1_700_002_000_000;
    const key = 'pub-b';
    for (let i = 0; i < 3; i += 1) checkPublicSubmitLimit(key, now + i);
    expect(checkPublicSubmitLimit(key, now + 10).limited).toBe(true);
    expect(checkPublicSubmitLimit(key, now + 60_001).limited).toBe(false);
  });

  it('키(IP)별로 독립이다', () => {
    const now = 1_700_003_000_000;
    for (let i = 0; i < 3; i += 1) checkPublicSubmitLimit('pub-c', now + i);
    expect(checkPublicSubmitLimit('pub-c', now + 5).limited).toBe(true);
    expect(checkPublicSubmitLimit('pub-d', now + 5).limited).toBe(false);
  });
});

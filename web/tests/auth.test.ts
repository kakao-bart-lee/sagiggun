import { describe, it, expect } from 'vitest';
import { createSessionToken, verifySessionToken } from '@/lib/auth';

const SECRET = 'a'.repeat(32);
const NOW = 1_700_000_000_000;

describe('세션 토큰', () => {
  it('만들고 검증하면 통과한다', async () => {
    const token = await createSessionToken(SECRET, NOW + 60_000);
    expect(await verifySessionToken(SECRET, token, NOW)).toBe(true);
  });

  it('만료되면 거부한다', async () => {
    const token = await createSessionToken(SECRET, NOW - 1);
    expect(await verifySessionToken(SECRET, token, NOW)).toBe(false);
  });

  it('다른 비밀키로는 검증되지 않는다', async () => {
    const token = await createSessionToken(SECRET, NOW + 60_000);
    expect(await verifySessionToken('b'.repeat(32), token, NOW)).toBe(false);
  });

  it('만료시각을 늘려 위조하면 거부한다', async () => {
    const token = await createSessionToken(SECRET, NOW + 1000);
    const [, sig] = token.split('.');
    const forged = `${NOW + 999_999}.${sig}`;
    expect(await verifySessionToken(SECRET, forged, NOW)).toBe(false);
  });

  it('형식이 깨진 토큰을 거부한다', async () => {
    for (const bad of ['', '.', 'abc', 'abc.def', '123', `${NOW + 1000}.`]) {
      expect(await verifySessionToken(SECRET, bad, NOW)).toBe(false);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { getEnv } from '@/lib/env';

const full = {
  DATABASE_URL: 'postgresql://localhost/x',
  ADMIN_PASSWORD: 'pw',
  SESSION_SECRET: 'a'.repeat(32),
  ANTHROPIC_API_KEY: 'sk-ant-x',
  PHOTO_DIR: './.photos',
};

describe('getEnv', () => {
  it('필요한 값을 모두 읽는다', () => {
    const env = getEnv(full);
    expect(env.databaseUrl).toBe('postgresql://localhost/x');
    expect(env.adminPassword).toBe('pw');
    expect(env.photoDir).toBe('./.photos');
  });

  it('PHOTO_DIR이 없으면 기본값을 쓴다', () => {
    const { PHOTO_DIR, ...rest } = full;
    expect(getEnv(rest).photoDir).toBe('./.photos');
  });

  it('필수 값이 비면 무엇이 빠졌는지 알려주며 실패한다', () => {
    const { ADMIN_PASSWORD, ...rest } = full;
    expect(() => getEnv(rest)).toThrow(/ADMIN_PASSWORD/);
  });

  it('SESSION_SECRET이 너무 짧으면 실패한다', () => {
    expect(() => getEnv({ ...full, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });
});

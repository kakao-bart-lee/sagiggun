import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),
  // 서명 키가 짧으면 세션 위조가 쉬워진다. 32자 이상을 강제한다.
  SESSION_SECRET: z.string().min(32),
  ANTHROPIC_API_KEY: z.string().min(1),
  PHOTO_DIR: z.string().min(1).default('./.photos'),
});

export type Env = {
  databaseUrl: string;
  adminPassword: string;
  sessionSecret: string;
  anthropicApiKey: string;
  photoDir: string;
};

export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`환경변수가 올바르지 않습니다: ${fields}`);
  }
  const v = parsed.data;
  return {
    databaseUrl: v.DATABASE_URL,
    adminPassword: v.ADMIN_PASSWORD,
    sessionSecret: v.SESSION_SECRET,
    anthropicApiKey: v.ANTHROPIC_API_KEY,
    photoDir: v.PHOTO_DIR,
  };
}

// Playwright e2e — LLM_MODE=mock, local Postgres
// Prerequisite: pnpm infra:up && pnpm db:migrate && pnpm db:seed && pnpm build
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT || 3101);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next start -p ${PORT} -H 127.0.0.1`,
    cwd: root,
    url: `${baseURL}/admin/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(PORT),
      LLM_MODE: 'mock',
      // 호스트 .env의 ADMIN_PASSWORD 등과 충돌하지 않도록 e2e 전용 값을 강제한다.
      ANTHROPIC_API_KEY: 'sk-ant-e2e-mock',
      OPS_API_TOKEN: 'e2e-ops-token-16chars',
      ADMIN_PASSWORD: 'e2e-admin-password',
      SESSION_SECRET: 'e2e-session-secret-at-least-32-chars!!',
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:15433/matching',
      PHOTO_DIR: path.join(root, '.photos-e2e'),
    },
  },
});

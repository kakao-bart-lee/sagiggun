import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = 'e2e-admin-password';
const OPS_TOKEN = 'e2e-ops-token-16chars';

test.describe('UI smoke', () => {
  test('로그인 후 시드 카드와 전달 큐 페이지', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    await expect(page.getByText('Some Love')).toBeVisible();
    await expect(page.getByText('mina_seoul')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: '전달 큐' }).click();
    await expect(page).toHaveURL(/\/admin\/deliveries/);
    await expect(page.getByRole('heading', { name: '전달 큐' })).toBeVisible();
  });

  test('프로필에서 매칭 추천 UI', async ({ page, request }) => {
    await page.goto('/admin/login');
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page).toHaveURL(/\/admin(?!\/login)/);

    const list = await request.get('/api/profiles?status=PUBLISHED', {
      headers: { Authorization: `Bearer ${OPS_TOKEN}` },
    });
    expect(list.status(), await list.text()).toBe(200);
    const { profiles } = await list.json();
    const subject = profiles.find((p: { sourceHandle: string }) => p.sourceHandle === 'jun_mapo');
    expect(subject).toBeTruthy();

    await page.goto(`/admin/profiles/${subject.id}`);
    await expect(page.getByRole('heading', { name: '@jun_mapo' })).toBeVisible();
    await page.getByRole('button', { name: /매칭 추천 생성/ }).click();
    await expect(page.getByText('PENDING').first()).toBeVisible({ timeout: 30_000 });
  });
});

import { test, expect } from '@playwright/test';

test.describe('browser game smoke', () => {
  test('index loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('dev panel visible with ?dev=1', async ({ page }) => {
    await page.goto('/?dev=1');
    await expect(page.locator('#dev-panel')).toBeVisible({ timeout: 15_000 });
  });
});

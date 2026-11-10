import {test, expect} from '@playwright/test';

/**
 * Phase 0 smoke tests.
 * They protect the baseline while the project is being migrated to the API backend.
 */

test.describe('SMD-HR baseline', () => {
  test.beforeEach(async ({page}) => {
    // Start every test from a clean browser store so the login screen is shown.
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test('shows the login screen with the SMD branding', async ({page}) => {
    await expect(page.getByRole('heading', {name: 'شركة السويس لمشتقات الميثانول'})).toBeVisible();
    await expect(page.getByText('تسجيل الدخول للنظام')).toBeVisible();
    await expect(page.getByPlaceholder('User')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('logs in and renders the dashboard', async ({page}) => {
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();

    await expect(page.getByText(/مرحباً/)).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
    await expect(page.getByText('لوحة التحكم').first()).toBeVisible();
  });

  test('navigates to the main HR modules', async ({page}) => {
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();
    await expect(page.getByText(/مرحباً/)).toBeVisible();

    const tabs = [
      'العاملين',
      'الحضور والورديات',
      'حاسبة الإضافي',
      'الإجازات والأرصدة',
      'الأذونات والمأموريات',
      'أجهزة ZKTeco',
      'التحليل القطاعي',
      'النماذج الذكية',
    ];

    for (const tab of tabs) {
      await page.getByRole('button', {name: tab}).first().click();
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('the overtime calculator produces a result', async ({page}) => {
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();
    await page.getByRole('button', {name: 'حاسبة الإضافي'}).first().click();

    // Preset scenario: normal day extended to 20:00.
    await expect(page.getByText(/إجمالي الساعات الإضافية/).first()).toBeVisible();
  });
});

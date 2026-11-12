import {test, expect} from '@playwright/test';
import path from 'path';

/**
 * Trial mode end-to-end: no FastAPI server, the document engine falls back to
 * this browser's IndexedDB (only because VITE_ALLOW_OFFLINE_DEMO is not 'false'
 * in the dev build). This test proves the whole chain works:
 * upload original -> create template -> design fields -> fill -> save -> print.
 *
 * The data is temporary by design; the UI must say so (asserted below).
 */

const FIXTURE = path.join(process.cwd(), 'tests/e2e/fixtures/sample-form.png');

test.describe('document engine - temporary browser demo', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/');
    await page.evaluate(async () => {
      window.localStorage.clear();
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('smd_hr_forms_demo');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    });
    await page.reload();
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();
    await page.getByRole('button', {name: 'النماذج والمستندات'}).first().click();
  });

  test('labels the trial store and never presents it as company data', async ({page}) => {
    await expect(page.getByText(/وضع تجربة مؤقت/)).toBeVisible();
    await expect(page.getByText(/بيانات محلية على هذا المتصفح فقط/)).toBeVisible();
    await expect(page.getByRole('button', {name: 'رفع مستند'})).toBeVisible();
    // Word/Excel are not offered in the browser-only mode.
    await expect(page.getByText(/PDF · PNG · JPEG · WebP/)).toBeVisible();
  });

  test('uploads, designs, fills, saves and prints a document', async ({page}) => {
    // --- Upload the original document (an image stands in for a scanned form).
    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await expect(page.getByText(/تم رفع «sample-form.png»/)).toBeVisible();

    // --- Create a template linked to that file.
    await page.getByRole('button', {name: 'قالب جديد'}).click();
    await page.getByLabel(/اسم القالب/).fill('نموذج تجربة');
    await page.getByRole('button', {name: 'إنشاء القالب'}).click();
    await expect(page.getByText(/تم إنشاء القالب «نموذج تجربة»/)).toBeVisible();

    // --- Design one field on top of the original document.
    await page.getByRole('button', {name: 'تصميم حقول نموذج تجربة'}).click();
    await page.getByRole('button', {name: 'إضافة حقل'}).click();
    await page.getByRole('button', {name: 'حفظ الحقول'}).click();
    await expect(page.getByText(/تم حفظ 1 حقل/)).toBeVisible();

    // --- Fill it manually, then save the submission in the browser store.
    await page.getByRole('button', {name: 'تعبئة نموذج تجربة'}).click();
    await expect(page.getByRole('heading', {name: /تعبئة وطباعة/})).toBeVisible();
    await page.locator('aside input').first().fill('م. مروان');
    await page.getByRole('button', {name: 'حفظ النموذج'}).click();
    await expect(
      page.getByText(/تم حفظ النموذج المعبأ لـ «نموذج تجربة»/),
    ).toBeVisible();

    // --- Printing renders an A4 sheet and cleans up after `afterprint`.
    await page.evaluate(() => {
      window.print = () => window.dispatchEvent(new Event('afterprint'));
    });
    await page.getByRole('button', {name: 'طباعة A4'}).click();
    await expect(page.locator('body')).toHaveClass(/smd-printing/);
    await expect(page.locator('body')).not.toHaveClass(/smd-printing/, {timeout: 5000});
    await expect(page.locator('style[data-smd-print]')).toHaveCount(0);
  });
});

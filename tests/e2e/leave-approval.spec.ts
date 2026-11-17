import {test, expect} from '@playwright/test';

/**
 * Phase 6 — Leave approval workflow (demo mode).
 * A request must start as "قيد المراجعة", and only HR/ADMIN can decide it.
 * Approving deducts the balance once; rejecting keeps it untouched.
 */

test.describe('leave approval workflow', () => {
  test.beforeEach(async ({page}) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();
    await expect(page.getByText(/مرحباً/)).toBeVisible();
    await page.getByRole('button', {name: 'الإجازات والأرصدة'}).first().click();
  });

  async function submitLeave(
    page: import('@playwright/test').Page,
    start: string,
    end: string,
    days: string,
  ) {
    await page.getByRole('button', {name: 'طلب إجازة جديد'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', {name: 'تسجيل طلب إجازة رسمي جديد'})).toBeVisible();
    const dates = dialog.locator('input[type="date"]');
    await dates.nth(0).fill(start);
    await dates.nth(1).fill(end);
    await dialog.locator('input[type="number"]').first().fill(days);
    await dialog.getByPlaceholder(/سبب طلب الإجازة/).fill('إجازة للاختبار الآلي');
    await dialog.getByRole('button', {name: 'تقديم الطلب للمراجعة'}).click();
    await expect(dialog).toHaveCount(0);
  }

  test('creates a pending request and approves it with a note', async ({page}) => {
    await submitLeave(page, '2027-06-10', '2027-06-12', '3');

    await page.getByRole('button', {name: /سجل الطلبات والاعتمادات/}).click();
    const row = page.getByRole('row', {name: /2027-06-10/});
    await expect(row).toBeVisible();
    await expect(row.getByText('قيد المراجعة')).toBeVisible();

    await row.getByRole('button', {name: 'اعتماد'}).click();
    const decision = page.getByRole('dialog');
    await expect(decision.getByRole('heading', {name: 'اعتماد طلب الإجازة'})).toBeVisible();
    await decision.getByLabel(/ملاحظات القرار/).fill('تمت المراجعة واعتماد الرصيد');
    await decision.getByRole('button', {name: 'تأكيد الاعتماد'}).click();

    await expect(decision).toHaveCount(0);
    await expect(row.getByText('معتمد')).toBeVisible();
    await expect(row.getByText(/قرار الإدارة: تمت المراجعة واعتماد الرصيد/)).toBeVisible();
    // A decided leave cannot be approved again from the UI.
    await expect(row.getByRole('button', {name: 'اعتماد'})).toHaveCount(0);
  });

  test('rejects a request with a reason and keeps it out of approvals', async ({page}) => {
    await submitLeave(page, '2027-07-01', '2027-07-02', '2');

    await page.getByRole('button', {name: /سجل الطلبات والاعتمادات/}).click();
    const row = page.getByRole('row', {name: /2027-07-01/});
    await expect(row).toBeVisible();

    await row.getByRole('button', {name: 'رفض'}).click();
    const decision = page.getByRole('dialog');
    await expect(decision.getByRole('heading', {name: 'رفض طلب الإجازة'})).toBeVisible();

    // A rejection reason is mandatory and validated in the dialog.
    await decision.getByRole('button', {name: 'تأكيد الرفض'}).click();
    await expect(decision.getByText(/يرجى إدخال سبب الرفض/)).toBeVisible();

    await decision.getByLabel(/سبب الرفض/).fill('تعارض مع احتياجات العمل');
    await decision.getByRole('button', {name: 'تأكيد الرفض'}).click();

    await expect(decision).toHaveCount(0);
    await expect(row.getByText('مرفوض')).toBeVisible();
    await expect(row.getByText(/قرار الإدارة: تعارض مع احتياجات العمل/)).toBeVisible();
  });
});

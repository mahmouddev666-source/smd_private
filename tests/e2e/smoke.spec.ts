import {test, expect} from '@playwright/test';

/**
 * Phase 1 smoke + demo-data tests.
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
    await expect(page.getByLabel(/اسم المستخدم/)).toBeVisible();
    await expect(page.getByLabel(/كلمة المرور/)).toBeVisible();
  });

  test('rejects invalid credentials', async ({page}) => {
    await page.getByLabel(/اسم المستخدم/).fill('admin');
    await page.getByLabel(/كلمة المرور/).fill('wrong-password');
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();

    await expect(page.getByText(/اسم المستخدم أو كلمة المرور غير صحيحة/)).toBeVisible();
    await expect(page.getByText(/مرحباً/)).toHaveCount(0);
  });

  test('logs in with the demo admin account and renders the dashboard', async ({page}) => {
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();

    await expect(page.getByText(/مرحباً/)).toBeVisible();
    await expect(page.getByRole('navigation').first()).toBeVisible();
    await expect(page.getByText('لوحة التحكم').first()).toBeVisible();
    await expect(page.getByText('حضور اليوم (البصمة)')).toBeVisible();
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

    // Preset scenario: normal day extended to 20:00 = 4h overtime.
    await expect(page.getByRole('heading', {name: 'نتائج الاحتساب المالي والزمني للإضافي'})).toBeVisible();
    await expect(page.getByText('إجمالي الساعات الفعلية:')).toBeVisible();
    await expect(page.getByText('إجمالي المقابل المالي المستحق للإضافي')).toBeVisible();
  });

  test('seeds clearly-labelled demo employees with 9001+ codes', async ({page}) => {
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();
    await page.getByRole('button', {name: 'العاملين'}).first().click();

    await expect(page.getByText('9001').first()).toBeVisible();
    await expect(page.getByText('م. أحمد محمود سعيد').first()).toBeVisible();
  });

  test('viewer role cannot create permits or missions', async ({page}) => {
    await page.getByLabel(/اسم المستخدم/).fill('viewer');
    await page.getByLabel(/كلمة المرور/).fill('Viewer@12345');
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();

    await page.getByRole('button', {name: 'الأذونات والمأموريات'}).first().click();
    await expect(page.getByRole('button', {name: 'إصدار تصريح / إذن'})).toHaveCount(0);
    await expect(page.getByText('مستخدم قراءة فقط')).toBeVisible();
  });

  test('viewer role cannot see employee write actions', async ({page}) => {
    await page.getByLabel(/اسم المستخدم/).fill('viewer');
    await page.getByLabel(/كلمة المرور/).fill('Viewer@12345');
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();

    await page.getByRole('button', {name: 'العاملين'}).first().click();
    await expect(page.getByRole('button', {name: 'إضافة موظف جديد'})).toHaveCount(0);
    await expect(page.getByTitle('تعديل بيانات الموظف')).toHaveCount(0);
    await expect(page.getByTitle('حذف الموظف')).toHaveCount(0);
  });

  test('admin edits an employee and deletes it after inline confirmation', async ({page}) => {
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();
    await page.getByRole('button', {name: 'العاملين'}).first().click();

    // Edit the first employee.
    await page.getByTitle('تعديل بيانات الموظف').first().click();
    const nameField = page.getByPlaceholder('الاسم الرباعي كما في بطاقة الرقم القومي');
    await expect(nameField).toBeVisible();
    await nameField.fill('م. أحمد محمود سعيد - معدل');
    await page.getByRole('button', {name: 'حفظ التعديلات'}).click();
    await expect(page.getByText('م. أحمد محمود سعيد - معدل').first()).toBeVisible();

    // Delete it: the confirmation is rendered inline, not via window.confirm.
    await page.getByTitle('حذف الموظف').first().click();
    await expect(page.getByRole('alertdialog')).toContainText('هل أنت متأكد من حذف الموظف');
    await page.getByRole('button', {name: 'تأكيد الحذف'}).click();
    await expect(page.getByText('م. أحمد محمود سعيد - معدل')).toHaveCount(0);
  });
});

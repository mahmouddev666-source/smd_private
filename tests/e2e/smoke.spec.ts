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

  test('admin records attendance and the overtime row is saved', async ({page}) => {
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();
    await page.getByRole('button', {name: 'الحضور والورديات'}).first().click();

    await page.getByRole('button', {name: 'تسجيل حركة حضور / إضافي'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Use a far-future date so the record is unique even across reruns.
    await dialog.locator('input[type="date"]').fill('2030-05-05');
    await page.getByRole('button', {name: 'احتساب وحفظ السجل'}).click();

    await expect(dialog).toHaveCount(0);
    const row = page.getByRole('row', {name: /2030-05-05/});
    await expect(row).toBeVisible();
    await expect(row).toContainText('إدخال يدوي');
  });

  test('admin creates a leave request and it appears in the approved log', async ({page}) => {
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();
    await page.getByRole('button', {name: 'الإجازات والأرصدة'}).first().click();

    await page.getByRole('button', {name: 'طلب إجازة جديد'}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Leave type = عارضة (second select), 1 day, future period.
    await dialog.locator('select').nth(1).selectOption('عارضة');
    const dateInputs = dialog.locator('input[type="date"]');
    await dateInputs.nth(0).fill('2030-06-01');
    await dateInputs.nth(1).fill('2030-06-01');
    await page.getByRole('button', {name: 'اعتماد وخصم من الرصيد'}).click();

    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', {name: /سجل الإجازات المسجلة والمعتمدة/}).click();
    await expect(page.getByText('2030-06-01 إلى 2030-06-01').first()).toBeVisible();
  });

  test('viewer role cannot record attendance or leaves', async ({page}) => {
    await page.getByLabel(/اسم المستخدم/).fill('viewer');
    await page.getByLabel(/كلمة المرور/).fill('Viewer@12345');
    await page.getByRole('button', {name: 'تسجيل الدخول'}).click();

    await page.getByRole('button', {name: 'الحضور والورديات'}).first().click();
    await expect(page.getByRole('button', {name: 'تسجيل حركة حضور / إضافي'})).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'استيراد Excel'})).toHaveCount(0);

    await page.getByRole('button', {name: 'الإجازات والأرصدة'}).first().click();
    await expect(page.getByRole('button', {name: 'طلب إجازة جديد'})).toHaveCount(0);
  });
});

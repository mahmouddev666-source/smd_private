import { describe, expect, it } from 'vitest';
import { AttendanceRecord, Employee, LeaveRecord } from '../../src/types';
import {
  buildAttendanceReport,
  buildLeavesReport,
  buildOvertimeReport,
  buildReportPrintHtml,
  isInRange,
} from '../../src/utils/reports';

function employee(overrides: Partial<Employee>): Employee {
  return {
    serial: 1,
    employeeId: '9001',
    name: 'موظف تجريبي',
    mobile: '01000000000',
    email: 'demo@smd.test',
    currentTitle: 'مهندس',
    position: 'مهندس',
    assignedTitle: 'مهندس',
    department: 'العمليات',
    contractType: 'دائم',
    grade: 'ثالثة',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    nationalId: '29001010100000',
    insuranceId: '1000001',
    hourlyRate: 50,
    hireDate: '2020-01-01',
    defaultShift: 'NORMAL_DAY',
    isActive: true,
    ...overrides,
  };
}

function attendance(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 'ATT-1',
    employeeId: '9001',
    date: '2026-11-10',
    shiftType: 'NORMAL_DAY',
    checkIn: '08:00',
    checkOut: '20:00',
    workingHours: 12,
    standardHours: 8,
    overtimeHoursTotal: 4,
    dayOvertimeHours: 2,
    nightOvertimeHours: 2,
    dayOvertimePay: 135,
    nightOvertimePay: 170,
    totalOvertimePay: 305,
    source: 'يدوي (معدل بواسطة المشرف)',
    status: 'إضافي',
    ...overrides,
  };
}

function leave(overrides: Partial<LeaveRecord>): LeaveRecord {
  return {
    id: 'LV-1',
    employeeId: '9001',
    leaveType: 'اعتيادي',
    startDate: '2026-11-10',
    endDate: '2026-11-12',
    daysCount: 3,
    status: 'معتمد',
    ...overrides,
  };
}

const FILTERS = { from: '2026-11-01', to: '2026-11-30', department: '', status: '' };

describe('isInRange', () => {
  it('accepts dates inside the inclusive range', () => {
    expect(isInRange('2026-11-01', '2026-11-01', '2026-11-30')).toBe(true);
    expect(isInRange('2026-11-30', '2026-11-01', '2026-11-30')).toBe(true);
  });

  it('rejects dates outside the range or empty dates', () => {
    expect(isInRange('2026-10-31', '2026-11-01', '2026-11-30')).toBe(false);
    expect(isInRange('2026-12-01', '2026-11-01', '2026-11-30')).toBe(false);
    expect(isInRange('', '2026-11-01', '2026-11-30')).toBe(false);
  });
});

describe('attendance report', () => {
  const staff = [employee({ employeeId: '9001' }), employee({ employeeId: '9002', department: 'الصيانه' })];
  const records = [
    attendance({ id: 'A1', employeeId: '9001', date: '2026-11-10' }),
    attendance({ id: 'A2', employeeId: '9002', date: '2026-11-11', workingHours: 8, overtimeHoursTotal: 0, totalOvertimePay: 0 }),
    attendance({ id: 'A3', employeeId: '9001', date: '2026-12-05', workingHours: 8, overtimeHoursTotal: 0, totalOvertimePay: 0 }),
  ];

  it('filters by range and department and sums totals', () => {
    const all = buildAttendanceReport(records, staff, FILTERS);
    expect(all.rows).toHaveLength(2);
    expect(all.totals.find((t) => t.label === 'إجمالي ساعات العمل')?.value).toBe(20);
    expect(all.totals.find((t) => t.label === 'إجمالي ساعات الإضافي')?.value).toBe(4);
    expect(all.totals.find((t) => t.label === 'إجمالي مستحقات الإضافي (ج.م)')?.value).toBe(305);
    expect(all.totals.find((t) => t.label === 'عدد الموظفين')?.value).toBe(2);

    const maintenance = buildAttendanceReport(records, staff, { ...FILTERS, department: 'الصيانه' });
    expect(maintenance.rows).toHaveLength(1);
    expect(maintenance.totals.find((t) => t.label === 'إجمالي ساعات العمل')?.value).toBe(8);
  });
});

describe('leaves report', () => {
  const staff = [employee({ employeeId: '9001' })];
  const leaves = [
    leave({ id: 'LV-1', daysCount: 3, status: 'معتمد' }),
    leave({ id: 'LV-2', daysCount: 2, status: 'قيد المراجعة', startDate: '2026-11-20', endDate: '2026-11-21' }),
    leave({ id: 'LV-3', daysCount: 4, status: 'مرفوض', startDate: '2026-11-25', endDate: '2026-11-28' }),
    leave({ id: 'LV-4', daysCount: 1, status: 'معتمد', startDate: '2026-12-10', endDate: '2026-12-10' }),
  ];

  it('totals days by status and respects the status filter', () => {
    const report = buildLeavesReport(leaves, staff, FILTERS);
    expect(report.rows).toHaveLength(3);
    expect(report.totals.find((t) => t.label === 'إجمالي الأيام')?.value).toBe(9);
    expect(report.totals.find((t) => t.label === 'أيام معتمدة')?.value).toBe(3);
    expect(report.totals.find((t) => t.label === 'أيام قيد المراجعة')?.value).toBe(2);
    expect(report.totals.find((t) => t.label === 'أيام مرفوضة')?.value).toBe(4);

    const approvedOnly = buildLeavesReport(leaves, staff, { ...FILTERS, status: 'معتمد' });
    expect(approvedOnly.rows).toHaveLength(1);
    expect(approvedOnly.totals.find((t) => t.label === 'إجمالي الأيام')?.value).toBe(3);
  });
});

describe('overtime report', () => {
  const staff = [employee({ employeeId: '9001', hourlyRate: 50 })];
  const records = [
    attendance({ id: 'A1', employeeId: '9001', date: '2026-11-10', overtimeHoursTotal: 4, totalOvertimePay: 305 }),
    attendance({ id: 'A2', employeeId: '9001', date: '2026-11-11', overtimeHoursTotal: 2, totalOvertimePay: 150 }),
    attendance({ id: 'A3', employeeId: '9001', date: '2026-12-01', overtimeHoursTotal: 8, totalOvertimePay: 500 }),
  ];

  it('groups by employee and sums only the selected period', () => {
    const report = buildOvertimeReport(records, staff, FILTERS);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]['عدد أيام الإضافي']).toBe(2);
    expect(report.rows[0]['إجمالي الإضافي (س)']).toBe(6);
    expect(report.rows[0]['مستحقات الإضافي (ج.م)']).toBe(455);
    expect(report.totals.find((t) => t.label === 'إجمالي المستحقات (ج.م)')?.value).toBe(455);
  });
});

describe('A4 RTL print view', () => {
  it('renders an RTL document with escaped cell values and totals', () => {
    const html = buildReportPrintHtml({
      title: 'تقرير اختبار',
      subtitle: 'الفترة: نوفمبر',
      columns: [{ key: 'name', label: 'الاسم' }],
      rows: [{ name: '<script>alert(1)</script>' }],
      totals: [{ label: 'العدد', value: 1 }],
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('@page { size: A4');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('تقرير اختبار');
  });
});

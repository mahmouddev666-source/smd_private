import {beforeEach, describe, expect, it} from 'vitest';
import type {AttendanceRecord, Employee} from '../../src/types';
import {StorageService} from '../../src/services/storage';
import {localDateISO} from '../../src/utils/dateUtils';

/** Minimal in-memory `localStorage` so the persistence layer can be unit-tested. */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const realEmployee: Omit<Employee, 'serial'> = {
  employeeId: '1500',
  name: 'موظف حقيقي للاختبار',
  mobile: '01000001500',
  email: 'real.employee@smd.com.eg',
  currentTitle: 'أخصائي اختبار',
  position: 'أخصائي',
  assignedTitle: '',
  department: 'الموارد البشريه',
  contractType: 'دائم',
  grade: 'ثانية',
  workLocation: 'المقر الإداري الرئيسي',
  nationalId: '29000000001500',
  insuranceId: '50001500',
  hourlyRate: 70,
  hireDate: '2022-01-01',
  defaultShift: 'NORMAL_DAY',
  isActive: true,
};

const attendanceFor = (
  checkOut: string,
  overrides: Partial<AttendanceRecord> = {},
): Omit<AttendanceRecord, 'id'> => ({
  employeeId: '1500',
  date: localDateISO(),
  shiftType: 'NORMAL_DAY',
  checkIn: '08:00',
  checkOut,
  workingHours: 12,
  standardHours: 8,
  overtimeHoursTotal: 4,
  dayOvertimeHours: 2,
  nightOvertimeHours: 2,
  dayOvertimePay: 189,
  nightOvertimePay: 238,
  totalOvertimePay: 427,
  source: 'يدوي (معدل بواسطة المشرف)',
  status: 'إضافي',
  ...overrides,
});

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

describe('StorageService — employee invariants', () => {
  it('rejects a duplicate employee code', () => {
    expect(() => StorageService.addEmployee({...realEmployee, employeeId: '9001'})).toThrow(
      /مستخدم بالفعل/,
    );
  });

  it('rejects a duplicate national id', () => {
    expect(() => StorageService.addEmployee({...realEmployee, nationalId: '29000000000001'})).toThrow(
      /الرقم القومي مسجل بالفعل/,
    );
  });

  it('updates an employee and keeps the serial stable', () => {
    const created = StorageService.addEmployee(realEmployee);
    StorageService.updateEmployee({...created, name: 'اسم محدث'});

    const updated = StorageService.findEmployee('1500');
    expect(updated?.name).toBe('اسم محدث');
    expect(updated?.serial).toBe(created.serial);
  });

  it('deletes the employee together with balances and attendance', () => {
    StorageService.addEmployee(realEmployee);
    StorageService.addAttendanceRecord(attendanceFor('16:30'));
    StorageService.deleteEmployee('1500');

    expect(StorageService.findEmployee('1500')).toBeUndefined();
    expect(StorageService.getLeaveBalances().some((b) => b.employeeId === '1500')).toBe(false);
    expect(StorageService.getAttendance().some((r) => r.employeeId === '1500')).toBe(false);
  });
});

describe('StorageService — attendance uniqueness', () => {
  it('creates only one row per employee per day (upsert)', () => {
    StorageService.addEmployee(realEmployee);

    StorageService.addAttendanceRecord(attendanceFor('16:30'));
    StorageService.addAttendanceRecord(attendanceFor('20:00', {totalOvertimePay: 999}));

    const rows = StorageService.getAttendance().filter(
      (record) => record.employeeId === '1500' && record.date === localDateISO(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].checkOut).toBe('20:00');
    expect(rows[0].totalOvertimePay).toBe(999);
  });
});

describe('StorageService — leave balances', () => {
  it('deducts the annual balance only for approved leaves and only once', () => {
    StorageService.addEmployee(realEmployee);

    StorageService.addLeave({
      employeeId: '1500',
      leaveType: 'اعتيادي',
      startDate: '2026-11-01',
      endDate: '2026-11-03',
      daysCount: 3,
      reason: 'اختبار',
      status: 'معتمد',
    });

    const balance = StorageService.getLeaveBalances().find((b) => b.employeeId === '1500');
    expect(balance?.annualUsed).toBe(3);

    StorageService.addLeave({
      employeeId: '1500',
      leaveType: 'اعتيادي',
      startDate: '2026-12-01',
      endDate: '2026-12-02',
      daysCount: 2,
      reason: 'اختبار — غير معتمد',
      status: 'قيد المراجعة',
    });

    const after = StorageService.getLeaveBalances().find((b) => b.employeeId === '1500');
    expect(after?.annualUsed).toBe(3);
  });
});

describe('StorageService — data version', () => {
  it('keeps business data when ensureDataVersion runs again', () => {
    StorageService.ensureDataVersion();
    StorageService.addEmployee(realEmployee);
    StorageService.addAttendanceRecord(attendanceFor('18:30'));

    // Regression: the version marker is JSON-encoded, so a raw string compare
    // used to wipe every business key on each call.
    StorageService.ensureDataVersion();

    expect(StorageService.findEmployee('1500')?.name).toBe(realEmployee.name);
    expect(
      StorageService.getAttendance().some(
        (record) => record.employeeId === '1500' && record.date === localDateISO(),
      ),
    ).toBe(true);
  });
});

describe('StorageService — demo data isolation', () => {
  it('resetDemoData keeps real records and removes demo records', () => {
    StorageService.addEmployee(realEmployee);

    StorageService.resetDemoData();

    const employees = StorageService.getEmployees();
    expect(employees.map((employee) => employee.employeeId)).toEqual(['1500']);
    expect(StorageService.getLeaves()).toHaveLength(0);
    expect(StorageService.getAttendance().some((record) => Number(record.employeeId) >= 9000)).toBe(false);
  });

  it('resetAllData restores the demo seed', () => {
    StorageService.addEmployee(realEmployee);
    StorageService.resetAllData();

    expect(StorageService.getEmployees()).toHaveLength(18);
    expect(StorageService.getEmployees()[0].employeeId).toBe('9001');
  });
});

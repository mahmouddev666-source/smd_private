import {describe, expect, it} from 'vitest';
import {Employee, LeaveRecord, MissionRecord, PermitRecord} from '../../src/types';
import {
  BINDING_GROUPS,
  bindingLabel,
  cairoDateISO,
  cairoTime,
  formatArabicDate,
  isKnownBinding,
  resolveBinding,
  resolveTemplateValues,
} from '../../src/utils/formBindings';

/**
 * The bindings decide which value is printed on top of an original company
 * document, so a wrong date format or a missing value would print a wrong
 * form. These tests pin the formatting rules.
 */

// The resolver only reads the properties it is asked for, so a partial object
// cast is enough here (and keeps the test readable).
const employee = {
  serial: 1,
  employeeId: '9005',
  name: 'م. مروان أحمد',
  department: 'الشؤون المالية',
  currentTitle: 'محاسب',
  position: 'محاسب',
  assignedTitle: 'محاسب أول',
  grade: 'الثالثة',
  contractType: 'دائم',
  workLocation: 'المقر الرئيسي',
  nationalId: '29001011234567',
  insuranceId: '123456',
  mobile: '01000000000',
  email: 'marwan@example.com',
  hourlyRate: 62.5,
  hireDate: '2021-03-15',
  defaultShift: 'NORMAL_DAY',
  isActive: true,
} as unknown as Employee;

describe('document bindings catalogue', () => {
  it('has unique binding values and Arabic labels', () => {
    const values = BINDING_GROUPS.flatMap((group) => group.options.map((option) => option.value));
    expect(new Set(values).size).toBe(values.length);
    expect(bindingLabel('employee.name')).toBe('اسم الموظف');
    expect(isKnownBinding('employee.name')).toBe(true);
    expect(isKnownBinding('employee.unknown')).toBe(false);
  });

  it('formats dates without timezone drift', () => {
    expect(formatArabicDate('2026-11-13')).toBe('13/11/2026');
    expect(formatArabicDate('')).toBe('');
    expect(formatArabicDate('غير محدد')).toBe('غير محدد');
  });

  it('builds the Cairo date/time used for `form.date` and `form.time`', () => {
    expect(cairoDateISO(new Date('2026-11-13T22:30:00Z'))).toBe('2026-11-14');
    expect(cairoTime(new Date('2026-11-13T22:30:00Z'))).toBe('00:30');
  });
});

describe('resolveBinding', () => {
  it('resolves employee fields and formats dates', () => {
    expect(resolveBinding('employee.name', {employee})).toBe('م. مروان أحمد');
    expect(resolveBinding('employee.hireDate', {employee})).toBe('15/03/2021');
    expect(resolveBinding('employee.hourlyRate', {employee})).toBe('62.5');
  });

  it('returns an empty string when the context has no record', () => {
    expect(resolveBinding('employee.name', {})).toBe('');
    expect(resolveBinding('leave.startDate', {employee})).toBe('');
  });

  it('resolves leave fields, including the replacement code', () => {
    const leave = {
      leaveType: 'سنوية',
      startDate: '2026-11-15',
      endDate: '2026-11-19',
      daysCount: 5,
      reason: 'إجازة سنوية',
      replacementEmployeeId: '9007',
    } as unknown as LeaveRecord;

    expect(resolveBinding('leave.type', {leave})).toBe('سنوية');
    expect(resolveBinding('leave.startDate', {leave})).toBe('15/11/2026');
    expect(resolveBinding('leave.daysCount', {leave})).toBe('5');
    expect(resolveBinding('leave.replacementName', {leave})).toBe('9007');
  });

  it('resolves permit and mission fields', () => {
    const permit = {
      permitType: 'إذن عمل',
      date: '2026-11-13',
      startTime: '10:00',
      endTime: '12:00',
      durationHours: 2,
      reason: 'إجراء بنكي',
    } as unknown as PermitRecord;

    expect(resolveBinding('permit.type', {permit})).toBe('إذن عمل');
    expect(resolveBinding('permit.date', {permit})).toBe('13/11/2026');
    expect(resolveBinding('permit.startTime', {permit})).toBe('10:00');
    expect(resolveBinding('permit.durationHours', {permit})).toBe('2');

    const mission = {
      missionType: 'مأمورية داخلية',
      destination: 'القاهرة',
      purpose: 'اجتماع',
      startDate: '2026-11-15',
      endDate: '2026-11-16',
      daysCount: 2,
      allowancePerDay: 150,
      totalAllowance: 300,
      transportationType: 'سيارة الشركة',
    } as unknown as MissionRecord;

    expect(resolveBinding('mission.type', {mission})).toBe('مأمورية داخلية');
    expect(resolveBinding('mission.transportation', {mission})).toBe('سيارة الشركة');
    expect(resolveBinding('mission.totalAllowance', {mission})).toBe('300');
    expect(resolveBinding('mission.startDate', {mission})).toBe('15/11/2026');
  });

  it('resolves company and form-level values', () => {
    expect(resolveBinding('company.name', {})).toContain('السويس لمشتقات الميثانول');
    expect(resolveBinding('company.nameEn', {})).toContain('SMD');
    expect(resolveBinding('form.date', {})).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(resolveBinding('form.dateWords', {})).toMatch(/^\d{1,2} [\u0600-\u06FF]+ \d{4}$/);
    expect(resolveBinding('form.time', {})).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns an empty string for an unsupported binding', () => {
    expect(resolveBinding('unknown.value', {employee})).toBe('');
  });
});

describe('resolveTemplateValues', () => {
  it('maps every field key to its resolved text', () => {
    const values = resolveTemplateValues(
      [
        {key: 'employee_name', binding: 'employee.name'},
        {key: 'employee_dept', binding: 'employee.department'},
        {key: 'missing', binding: 'leave.type'},
      ],
      {employee},
    );

    expect(values).toEqual({
      employee_name: 'م. مروان أحمد',
      employee_dept: 'الشؤون المالية',
      missing: '',
    });
  });
});

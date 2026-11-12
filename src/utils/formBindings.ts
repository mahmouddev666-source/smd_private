/**
 * SMD - Suez Methanol Derivatives Co.
 * Data bindings for the document engine.
 *
 * A template field stores a `binding` such as `employee.name`; at fill time the
 * value is resolved from the current context (employee + leave/permit/mission).
 * The server validates the binding pattern (`^[a-zA-Z][a-zA-Z0-9_.]{0,63}$`),
 * this file is the UI catalogue of supported bindings.
 */

import { Employee, LeaveRecord, MissionRecord, PermitRecord } from '../types';

const COMPANY_NAME_AR = 'شركة السويس لمشتقات الميثانول (ش.م.م)';
const COMPANY_NAME_EN = 'Suez Methanol Derivatives Co. (SMD)';

export interface BindingOption {
  value: string;
  label: string;
}

export interface BindingGroup {
  group: string;
  options: BindingOption[];
}

export const BINDING_GROUPS: BindingGroup[] = [
  {
    group: 'بيانات الموظف',
    options: [
      { value: 'employee.employeeId', label: 'كود الموظف' },
      { value: 'employee.serial', label: 'الرقم التسلسلي' },
      { value: 'employee.name', label: 'اسم الموظف' },
      { value: 'employee.department', label: 'الإدارة / القطاع' },
      { value: 'employee.currentTitle', label: 'المسمى الوظيفي' },
      { value: 'employee.position', label: 'الوظيفة' },
      { value: 'employee.assignedTitle', label: 'المسمى المكلف به' },
      { value: 'employee.grade', label: 'الدرجة الوظيفية' },
      { value: 'employee.contractType', label: 'نوع العقد' },
      { value: 'employee.workLocation', label: 'موقع العمل' },
      { value: 'employee.nationalId', label: 'الرقم القومي' },
      { value: 'employee.insuranceId', label: 'الرقم التأميني' },
      { value: 'employee.mobile', label: 'رقم المحمول' },
      { value: 'employee.email', label: 'البريد الإلكتروني' },
      { value: 'employee.hireDate', label: 'تاريخ التعيين' },
      { value: 'employee.hourlyRate', label: 'أجر الساعة' },
    ],
  },
  {
    group: 'الإجازة',
    options: [
      { value: 'leave.type', label: 'نوع الإجازة' },
      { value: 'leave.startDate', label: 'تاريخ بدء الإجازة' },
      { value: 'leave.endDate', label: 'تاريخ انتهاء الإجازة' },
      { value: 'leave.daysCount', label: 'عدد أيام الإجازة' },
      { value: 'leave.reason', label: 'سبب الإجازة' },
      { value: 'leave.notes', label: 'ملاحظات الإجازة' },
      { value: 'leave.replacementName', label: 'البديل أثناء الإجازة' },
      { value: 'leave.status', label: 'حالة الإجازة' },
      { value: 'leave.approvalDate', label: 'تاريخ الاعتماد' },
    ],
  },
  {
    group: 'المأمورية',
    options: [
      { value: 'mission.type', label: 'نوع المأمورية' },
      { value: 'mission.destination', label: 'جهة المأمورية' },
      { value: 'mission.purpose', label: 'الغرض من المأمورية' },
      { value: 'mission.startDate', label: 'تاريخ بدء المأمورية' },
      { value: 'mission.endDate', label: 'تاريخ انتهاء المأمورية' },
      { value: 'mission.daysCount', label: 'عدد أيام المأمورية' },
      { value: 'mission.allowancePerDay', label: 'بدل اليوم' },
      { value: 'mission.totalAllowance', label: 'إجمالي البدل' },
      { value: 'mission.transportation', label: 'وسيلة الانتقال' },
      { value: 'mission.status', label: 'حالة المأمورية' },
    ],
  },
  {
    group: 'الإذن',
    options: [
      { value: 'permit.type', label: 'نوع الإذن' },
      { value: 'permit.date', label: 'تاريخ الإذن' },
      { value: 'permit.startTime', label: 'من الساعة' },
      { value: 'permit.endTime', label: 'إلى الساعة' },
      { value: 'permit.durationHours', label: 'مدة الإذن (ساعات)' },
      { value: 'permit.reason', label: 'سبب الإذن' },
      { value: 'permit.status', label: 'حالة الإذن' },
    ],
  },
  {
    group: 'النموذج والشركة',
    options: [
      { value: 'company.name', label: 'اسم الشركة (عربي)' },
      { value: 'company.nameEn', label: 'اسم الشركة (إنجليزي)' },
      { value: 'form.date', label: 'تاريخ اليوم' },
      { value: 'form.dateWords', label: 'تاريخ اليوم (نص)' },
      { value: 'form.time', label: 'الوقت الحالي' },
    ],
  },
];

const BINDING_LABELS = new Map<string, string>(
  BINDING_GROUPS.flatMap((group) => group.options.map((option) => [option.value, option.label] as const)),
);

export function bindingLabel(binding: string): string {
  return BINDING_LABELS.get(binding) || binding;
}

export function isKnownBinding(binding: string): boolean {
  return BINDING_LABELS.has(binding);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` → `DD/MM/YYYY` without timezone drift. */
export function formatArabicDate(value: string | undefined | null): string {
  if (!value) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Short Arabic month names, indexed by 1-based month. */
const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

function dateInWords(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const day = Number(match[3]);
  const month = AR_MONTHS[Number(match[2]) - 1] || '';
  return `${day} ${month} ${match[1]}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

/** Local date in `Africa/Cairo` (never `toISOString`, which shifts the day). */
export function cairoDateISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function cairoTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

// ---------------------------------------------------------------------------
// Context + resolution
// ---------------------------------------------------------------------------

export interface FormBindingContext {
  employee?: Employee | null;
  leave?: Partial<LeaveRecord> | null;
  permit?: Partial<PermitRecord> | null;
  mission?: Partial<MissionRecord> | null;
}

type Scalar = string | number | boolean | undefined | null;

function pick(context: FormBindingContext, binding: string): Scalar {
  if (binding === 'company.name') return COMPANY_NAME_AR;
  if (binding === 'company.nameEn') return COMPANY_NAME_EN;
  if (binding === 'form.date') return cairoDateISO();
  if (binding === 'form.dateWords') return dateInWords(cairoDateISO());
  if (binding === 'form.time') return cairoTime();

  const [root, property] = binding.split('.');
  if (!root || !property) return '';

  if (root === 'employee') {
    const employee = context.employee;
    if (!employee) return '';
    const value = (employee as unknown as Record<string, unknown>)[property];
    return typeof value === 'number' || typeof value === 'string' ? value : '';
  }

  if (root === 'leave') {
    const leave = context.leave;
    if (!leave) return '';
    if (property === 'type') return leave.leaveType || '';
    if (property === 'replacementName') {
      // The leave record stores the replacement code, not a name.
      return leave.replacementEmployeeId || '';
    }
    const value = (leave as unknown as Record<string, unknown>)[property];
    return typeof value === 'number' || typeof value === 'string' ? value : '';
  }

  if (root === 'permit') {
    const permit = context.permit;
    if (!permit) return '';
    if (property === 'type') return permit.permitType || '';
    const value = (permit as unknown as Record<string, unknown>)[property];
    return typeof value === 'number' || typeof value === 'string' ? value : '';
  }

  if (root === 'mission') {
    const mission = context.mission;
    if (!mission) return '';
    if (property === 'type') return mission.missionType || '';
    if (property === 'transportation') return mission.transportationType || '';
    const value = (mission as unknown as Record<string, unknown>)[property];
    return typeof value === 'number' || typeof value === 'string' ? value : '';
  }

  return '';
}

/** Resolve a binding into the text that is printed on top of the document. */
export function resolveBinding(binding: string, context: FormBindingContext): string {
  const raw = pick(context, binding);
  if (raw === undefined || raw === null || raw === '') return '';

  if (typeof raw === 'number') return formatNumber(raw);
  if (typeof raw === 'boolean') return raw ? 'نعم' : 'لا';

  // Format dates but never reformat plain text that happens to contain dashes.
  if (/(date)$/i.test(binding)) return formatArabicDate(raw);
  if (/(startTime|endTime)$/.test(binding)) return raw.length > 5 ? raw.slice(0, 5) : raw;
  if (/(hourlyRate|allowancePerDay|totalAllowance|durationHours|daysCount)$/.test(binding)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? formatNumber(numeric) : raw;
  }
  return raw;
}

/** Resolve every field of a template in one pass. */
export function resolveTemplateValues(
  fields: { key: string; binding: string }[],
  context: FormBindingContext,
): Record<string, string> {
  const values: Record<string, string> = {};
  fields.forEach((field) => {
    values[field.key] = resolveBinding(field.binding, context);
  });
  return values;
}

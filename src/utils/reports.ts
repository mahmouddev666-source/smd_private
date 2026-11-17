/**
 * SMD - Suez Methanol Derivatives Co.
 * Pure reporting engine for Attendance, Leaves and Overtime.
 *
 * All aggregation lives here (no React, no DOM) so the totals can be unit
 * tested. Export/print helpers only render the data produced by these builders.
 */

import * as XLSX from 'xlsx';
import { AttendanceRecord, Employee, LeaveRecord } from '../types';

export type ReportKind = 'attendance' | 'leaves' | 'overtime';

export interface ReportFilters {
  from: string; // ISO date (Africa/Cairo local date)
  to: string;
  department: string; // '' = all departments
  status: string; // '' = all statuses
}

export interface ReportRow {
  [key: string]: string | number;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'right' | 'left' | 'center';
}

export interface ReportTotal {
  label: string;
  value: string | number;
}

export interface ReportTable {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportTotal[];
}

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const num = (value: number | undefined | null): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function isInRange(date: string, from: string, to: string): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function employeeMap(employees: Employee[]): Map<string, Employee> {
  return new Map(employees.map((employee) => [employee.employeeId, employee]));
}

function keepEmployee(
  employee: Employee | undefined,
  filters: ReportFilters,
): boolean {
  return !filters.department || employee?.department === filters.department;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export function buildAttendanceReport(
  attendance: AttendanceRecord[],
  employees: Employee[],
  filters: ReportFilters,
): ReportTable {
  const byId = employeeMap(employees);
  const rows = attendance
    .filter((record) => isInRange(record.date, filters.from, filters.to))
    .filter((record) => keepEmployee(byId.get(record.employeeId), filters))
    .sort((a, b) => (a.date === b.date ? a.employeeId.localeCompare(b.employeeId) : a.date.localeCompare(b.date)))
    .map((record) => {
      const employee = byId.get(record.employeeId);
      return {
        'كود الموظف': record.employeeId,
        'اسم الموظف': employee?.name || '',
        'الإدارة / القطاع': employee?.department || '',
        'التاريخ': record.date,
        'الوردية': shiftLabel(record.shiftType),
        'حضور': record.checkIn || '—',
        'انصراف': record.checkOut || '—',
        'ساعات العمل': round(num(record.workingHours)),
        'إجمالي الإضافي (س)': round(num(record.overtimeHoursTotal)),
        'إضافي نهاري (س)': round(num(record.dayOvertimeHours)),
        'إضافي ليلي (س)': round(num(record.nightOvertimeHours)),
        'قيمة الإضافي (ج.م)': round(num(record.totalOvertimePay)),
        'الحالة': record.status,
      } satisfies ReportRow;
    });

  const workingHours = attendance
    .filter((record) => isInRange(record.date, filters.from, filters.to))
    .filter((record) => keepEmployee(byId.get(record.employeeId), filters))
    .reduce((sum, record) => sum + num(record.workingHours), 0);

  const overtimeHours = attendance
    .filter((record) => isInRange(record.date, filters.from, filters.to))
    .filter((record) => keepEmployee(byId.get(record.employeeId), filters))
    .reduce((sum, record) => sum + num(record.overtimeHoursTotal), 0);

  const overtimePay = attendance
    .filter((record) => isInRange(record.date, filters.from, filters.to))
    .filter((record) => keepEmployee(byId.get(record.employeeId), filters))
    .reduce((sum, record) => sum + num(record.totalOvertimePay), 0);

  const uniqueEmployees = new Set(rows.map((row) => String(row['كود الموظف']))).size;
  const lateCount = rows.filter((row) => row['الحالة'] === 'متأخر').length;
  const absentCount = rows.filter((row) => row['الحالة'] === 'غياب').length;

  return {
    title: 'تقرير الحضور والانصراف',
    subtitle: rangeLabel(filters),
    columns: [
      { key: 'كود الموظف', label: 'الكود', align: 'center' },
      { key: 'اسم الموظف', label: 'اسم الموظف' },
      { key: 'الإدارة / القطاع', label: 'الإدارة / القطاع' },
      { key: 'التاريخ', label: 'التاريخ', align: 'center' },
      { key: 'الوردية', label: 'الوردية', align: 'center' },
      { key: 'حضور', label: 'حضور', align: 'center' },
      { key: 'انصراف', label: 'انصراف', align: 'center' },
      { key: 'ساعات العمل', label: 'ساعات العمل', align: 'center' },
      { key: 'إجمالي الإضافي (س)', label: 'إضافي (س)', align: 'center' },
      { key: 'قيمة الإضافي (ج.م)', label: 'قيمة الإضافي', align: 'center' },
      { key: 'الحالة', label: 'الحالة', align: 'center' },
    ],
    rows,
    totals: [
      { label: 'عدد السجلات', value: rows.length },
      { label: 'عدد الموظفين', value: uniqueEmployees },
      { label: 'إجمالي ساعات العمل', value: round(workingHours) },
      { label: 'إجمالي ساعات الإضافي', value: round(overtimeHours) },
      { label: 'إجمالي مستحقات الإضافي (ج.م)', value: round(overtimePay) },
      { label: 'حالات التأخير', value: lateCount },
      { label: 'حالات الغياب', value: absentCount },
    ],
  };
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

export function buildLeavesReport(
  leaves: LeaveRecord[],
  employees: Employee[],
  filters: ReportFilters,
): ReportTable {
  const byId = employeeMap(employees);
  const filtered = leaves
    .filter((leave) => isInRange(leave.startDate, filters.from, filters.to))
    .filter((leave) => keepEmployee(byId.get(leave.employeeId), filters))
    .filter((leave) => !filters.status || leave.status === filters.status);

  const rows = filtered
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((leave) => {
      const employee = byId.get(leave.employeeId);
      return {
        'رقم الطلب': leave.id,
        'كود الموظف': leave.employeeId,
        'اسم الموظف': employee?.name || '',
        'الإدارة / القطاع': employee?.department || '',
        'نوع الإجازة': leave.leaveType,
        'من تاريخ': leave.startDate,
        'إلى تاريخ': leave.endDate,
        'عدد الأيام': round(num(leave.daysCount)),
        'الحالة': leave.status,
        'المعتمد': leave.approvedBy || '—',
        'سبب القرار': leave.decisionNotes || '—',
      } satisfies ReportRow;
    });

  const daysOf = (status?: string) =>
    round(
      filtered
        .filter((leave) => !status || leave.status === status)
        .reduce((sum, leave) => sum + num(leave.daysCount), 0),
    );

  const byType = filtered.reduce<Record<string, number>>((acc, leave) => {
    acc[leave.leaveType] = round((acc[leave.leaveType] || 0) + num(leave.daysCount));
    return acc;
  }, {});

  const typeSummary = Object.entries(byType)
    .map(([type, days]) => `${type}: ${days} يوم`)
    .join(' — ');

  return {
    title: 'تقرير الإجازات والطلبات',
    subtitle: rangeLabel(filters),
    columns: [
      { key: 'رقم الطلب', label: 'رقم الطلب', align: 'center' },
      { key: 'كود الموظف', label: 'الكود', align: 'center' },
      { key: 'اسم الموظف', label: 'اسم الموظف' },
      { key: 'الإدارة / القطاع', label: 'الإدارة / القطاع' },
      { key: 'نوع الإجازة', label: 'نوع الإجازة', align: 'center' },
      { key: 'من تاريخ', label: 'من', align: 'center' },
      { key: 'إلى تاريخ', label: 'إلى', align: 'center' },
      { key: 'عدد الأيام', label: 'الأيام', align: 'center' },
      { key: 'الحالة', label: 'الحالة', align: 'center' },
      { key: 'المعتمد', label: 'المعتمد', align: 'center' },
    ],
    rows,
    totals: [
      { label: 'عدد الطلبات', value: rows.length },
      { label: 'إجمالي الأيام', value: daysOf() },
      { label: 'أيام معتمدة', value: daysOf('معتمد') },
      { label: 'أيام قيد المراجعة', value: daysOf('قيد المراجعة') },
      { label: 'أيام مرفوضة', value: daysOf('مرفوض') },
      { label: 'التوزيع حسب النوع', value: typeSummary || '—' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Overtime (per employee)
// ---------------------------------------------------------------------------

export function buildOvertimeReport(
  attendance: AttendanceRecord[],
  employees: Employee[],
  filters: ReportFilters,
): ReportTable {
  const byId = employeeMap(employees);
  const inRange = attendance.filter(
    (record) =>
      isInRange(record.date, filters.from, filters.to) &&
      keepEmployee(byId.get(record.employeeId), filters),
  );

  const grouped = new Map<
    string,
    { records: number; hours: number; day: number; night: number; pay: number }
  >();
  for (const record of inRange) {
    const entry = grouped.get(record.employeeId) || { records: 0, hours: 0, day: 0, night: 0, pay: 0 };
    entry.records += 1;
    entry.hours += num(record.overtimeHoursTotal);
    entry.day += num(record.dayOvertimeHours);
    entry.night += num(record.nightOvertimeHours);
    entry.pay += num(record.totalOvertimePay);
    grouped.set(record.employeeId, entry);
  }

  const rows = Array.from(grouped.entries())
    .map(([employeeId, entry]) => {
      const employee = byId.get(employeeId);
      return {
        'كود الموظف': employeeId,
        'اسم الموظف': employee?.name || '',
        'الإدارة / القطاع': employee?.department || '',
        'أجر الساعة (ج.م)': round(num(employee?.hourlyRate)),
        'عدد أيام الإضافي': entry.records,
        'إجمالي الإضافي (س)': round(entry.hours),
        'إضافي نهاري (س)': round(entry.day),
        'إضافي ليلي (س)': round(entry.night),
        'مستحقات الإضافي (ج.م)': round(entry.pay),
      } satisfies ReportRow;
    })
    .sort((a, b) => Number(b['مستحقات الإضافي (ج.م)']) - Number(a['مستحقات الإضافي (ج.م)']));

  const sum = (selector: (row: ReportRow) => number) =>
    round(rows.reduce((total, row) => total + selector(row), 0));

  return {
    title: 'تقرير الوقت الإضافي ومستحقاته',
    subtitle: `${rangeLabel(filters)} — فاصل الإضافي 18:00`,
    columns: [
      { key: 'كود الموظف', label: 'الكود', align: 'center' },
      { key: 'اسم الموظف', label: 'اسم الموظف' },
      { key: 'الإدارة / القطاع', label: 'الإدارة / القطاع' },
      { key: 'أجر الساعة (ج.م)', label: 'أجر الساعة', align: 'center' },
      { key: 'عدد أيام الإضافي', label: 'الأيام', align: 'center' },
      { key: 'إجمالي الإضافي (س)', label: 'الإجمالي (س)', align: 'center' },
      { key: 'إضافي نهاري (س)', label: 'نهاري (س)', align: 'center' },
      { key: 'إضافي ليلي (س)', label: 'ليلي (س)', align: 'center' },
      { key: 'مستحقات الإضافي (ج.م)', label: 'المستحقات (ج.م)', align: 'center' },
    ],
    rows,
    totals: [
      { label: 'عدد الموظفين', value: rows.length },
      {
        label: 'عدد أيام الإضافي',
        value: rows.reduce((total, row) => total + Number(row['عدد أيام الإضافي']), 0),
      },
      { label: 'إجمالي الساعات', value: sum((row) => Number(row['إجمالي الإضافي (س)'])) },
      { label: 'الإضافي النهاري', value: sum((row) => Number(row['إضافي نهاري (س)'])) },
      { label: 'الإضافي الليلي', value: sum((row) => Number(row['إضافي ليلي (س)'])) },
      {
        label: 'إجمالي المستحقات (ج.م)',
        value: sum((row) => Number(row['مستحقات الإضافي (ج.م)'])),
      },
    ],
  };
}

export function buildReport(
  kind: ReportKind,
  data: { attendance: AttendanceRecord[]; leaves: LeaveRecord[]; employees: Employee[] },
  filters: ReportFilters,
): ReportTable {
  if (kind === 'leaves') return buildLeavesReport(data.leaves, data.employees, filters);
  if (kind === 'overtime') return buildOvertimeReport(data.attendance, data.employees, filters);
  return buildAttendanceReport(data.attendance, data.employees, filters);
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

export function exportReportToExcel(table: ReportTable, filename: string): void {
  const rows = table.rows.map((row) => {
    const output: ReportRow = {};
    for (const column of table.columns) {
      output[column.label] = row[column.key] ?? '';
    }
    return output;
  });
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, table.title.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A4 RTL print view in a separate window (no navigation, no app chrome). */
export function buildReportPrintHtml(table: ReportTable): string {
  const head = table.columns
    .map((column) => `<th style="text-align:${column.align || 'right'}">${escapeHtml(column.label)}</th>`)
    .join('');
  const body = table.rows
    .map(
      (row) =>
        `<tr>${table.columns
          .map(
            (column) =>
              `<td style="text-align:${column.align || 'right'}">${escapeHtml(row[column.key] ?? '')}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  const totals = table.totals
    .map((total) => `<div class="total"><span>${escapeHtml(total.label)}</span><strong>${escapeHtml(total.value)}</strong></div>`)
    .join('');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(table.title)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Cairo", "Segoe UI", Tahoma, sans-serif; color: #0f172a; margin: 0; }
  header { border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  header h1 { font-size: 16px; margin: 0; color: #1e3a8a; }
  header p { margin: 4px 0 0; font-size: 11px; color: #475569; }
  .brand { text-align: left; font-size: 10px; color: #64748b; }
  h2 { font-size: 14px; margin: 0 0 4px; }
  .subtitle { font-size: 11px; color: #475569; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #e2e8f0; color: #0f172a; padding: 6px 4px; border: 1px solid #cbd5e1; font-weight: 700; }
  td { padding: 5px 4px; border: 1px solid #e2e8f0; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .totals { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
  .total { border: 1px solid #cbd5e1; background: #f1f5f9; border-radius: 6px; padding: 6px 10px; font-size: 10px; min-width: 150px; display: flex; justify-content: space-between; gap: 12px; }
  footer { margin-top: 16px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <header>
    <div>
      <h1>شركة السويس لمشتقات الميثانول (SMD)</h1>
      <p>الإدارة العامة للموارد البشرية — نظام إدارة الموارد البشرية والحضور</p>
    </div>
    <div class="brand">تقرير رسمي</div>
  </header>
  <h2>${escapeHtml(table.title)}</h2>
  <p class="subtitle">${escapeHtml(table.subtitle)}</p>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body || `<tr><td colspan="${table.columns.length}">لا توجد بيانات مطابقة للفترة المحددة.</td></tr>`}</tbody>
  </table>
  <div class="totals">${totals}</div>
  <footer>
    <span>عدد السجلات: ${table.rows.length}</span>
    <span>تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')}</span>
  </footer>
</body>
</html>`;
}

/** Opens the A4 print window. Returns false when the popup was blocked. */
export function printReport(table: ReportTable): boolean {
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) return false;
  win.document.open();
  win.document.write(buildReportPrintHtml(table));
  win.document.close();
  win.focus();
  win.setTimeout(() => {
    win.print();
  }, 350);
  return true;
}

function shiftLabel(shift: AttendanceRecord['shiftType']): string {
  if (shift === 'NORMAL_DAY') return 'يوم عمل عادي';
  if (shift === 'DAY_SHIFT') return 'وردية نهارية';
  return 'وردية ليلية';
}

function rangeLabel(filters: ReportFilters): string {
  const from = filters.from || 'بداية السجل';
  const to = filters.to || 'اليوم';
  const department = filters.department || 'كل الإدارات';
  const status = filters.status ? ` — الحالة: ${filters.status}` : '';
  return `الفترة: ${from} إلى ${to} — ${department}${status}`;
}

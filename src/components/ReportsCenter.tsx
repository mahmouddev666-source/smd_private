/**
 * SMD - Suez Methanol Derivatives Co.
 * Reports center: Attendance, Leaves, Overtime and the departmental analysis.
 *
 * Every figure comes from `utils/reports.ts` (pure functions, unit tested).
 * Excel export uses SheetJS; PDF export opens an A4 RTL print view so the
 * sidebar and app chrome are never printed.
 */

import React, { useMemo, useState } from 'react';
import {
  AttendanceRecord,
  Employee,
  LeaveRecord,
  MissionRecord,
  SMD_DEPARTMENTS,
} from '../types';
import {
  BarChart3,
  Calendar,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  Printer,
  XCircle,
} from 'lucide-react';
import {
  buildReport,
  exportReportToExcel,
  printReport,
  ReportKind,
} from '../utils/reports';
import { localDateISO } from '../utils/dateUtils';
import { DepartmentReports } from './DepartmentReports';

interface ReportsCenterProps {
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRecord[];
  missions: MissionRecord[];
}

type ReportTab = ReportKind | 'departments';

const TABS: Array<{ id: ReportTab; label: string; icon: React.ElementType }> = [
  { id: 'attendance', label: 'تقرير الحضور والانصراف', icon: Clock },
  { id: 'leaves', label: 'تقرير الإجازات', icon: Calendar },
  { id: 'overtime', label: 'تقرير الوقت الإضافي', icon: DollarSign },
  { id: 'departments', label: 'التحليل القطاعي', icon: BarChart3 },
];

function monthStart(): string {
  // Local date parts only: never use toISOString() for Africa/Cairo dates.
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export const ReportsCenter: React.FC<ReportsCenterProps> = ({
  employees,
  attendance,
  leaves,
  missions,
}) => {
  const [tab, setTab] = useState<ReportTab>('attendance');
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(localDateISO());
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const departments = useMemo(() => {
    const present = new Set(employees.map((employee) => employee.department));
    return SMD_DEPARTMENTS.filter((item) => present.has(item));
  }, [employees]);

  const table = useMemo(() => {
    if (tab === 'departments') return null;
    return buildReport(
      tab,
      { attendance, leaves, employees },
      { from, to, department, status: tab === 'leaves' ? status : '' },
    );
  }, [tab, attendance, leaves, employees, from, to, department, status]);

  const fileBase = table
    ? `${table.title.replace(/\s+/g, '_')}_${from}_${to}`
    : `التقرير_القطاعي_${localDateISO()}`;

  const handleExcel = () => {
    if (!table) return;
    exportReportToExcel(table, fileBase);
  };

  const handlePrint = () => {
    if (!table) return;
    setError(null);
    if (!printReport(table)) {
      setError('تعذّر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة ثم المحاولة مرة أخرى.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">مركز التقارير والتحليلات</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تقارير الحضور والإجازات والوقت الإضافي بفترة وإدارة وحالة، مع إجماليات دقيقة وتصدير
            Excel وطباعة A4 عربية (RTL).
          </p>
        </div>
        {table && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel</span>
            </button>
            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>تصدير PDF / طباعة A4</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`py-2 px-4 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                tab === item.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="p-3.5 bg-rose-50 border border-rose-300 text-rose-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}

      {tab === 'departments' ? (
        <DepartmentReports
          employees={employees}
          attendance={attendance}
          leaves={leaves}
          missions={missions}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label htmlFor="report-from" className="block text-[11px] font-bold text-slate-700 mb-1">
                  من تاريخ
                </label>
                <input
                  id="report-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="report-to" className="block text-[11px] font-bold text-slate-700 mb-1">
                  إلى تاريخ
                </label>
                <input
                  id="report-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="report-department" className="block text-[11px] font-bold text-slate-700 mb-1">
                  الإدارة / القطاع
                </label>
                <select
                  id="report-department"
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">كل الإدارات</option>
                  {departments.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              {tab === 'leaves' ? (
                <div>
                  <label htmlFor="report-status" className="block text-[11px] font-bold text-slate-700 mb-1">
                    حالة الطلب
                  </label>
                  <select
                    id="report-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">كل الحالات</option>
                    <option value="قيد المراجعة">قيد المراجعة</option>
                    <option value="معتمد">معتمد</option>
                    <option value="مرفوض">مرفوض</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-end">
                  <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 font-semibold">
                    الإجماليات محسوبة من سجلات الفترة المحددة فقط.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Totals */}
          {table && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {table.totals.map((total) => (
                <div key={total.label} className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <p className="text-[10px] font-bold text-slate-500 leading-tight">{total.label}</p>
                  <p className="mt-1 text-base font-bold font-mono text-blue-800 break-words">{total.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Data table */}
          {table && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{table.title}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">{table.subtitle}</p>
                </div>
                <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                  {table.rows.length} سجل
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <caption className="sr-only">{table.title}</caption>
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      {table.columns.map((column) => (
                        <th
                          key={column.key}
                          scope="col"
                          className={`py-3 px-3 whitespace-nowrap ${
                            column.align === 'center' ? 'text-center' : ''
                          }`}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {table.rows.length === 0 ? (
                      <tr>
                        <td colSpan={table.columns.length} className="py-10 text-center text-slate-400 font-semibold">
                          لا توجد بيانات مطابقة للفترة أو الإدارة المحددة.
                        </td>
                      </tr>
                    ) : (
                      table.rows.map((row, index) => (
                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                          {table.columns.map((column) => (
                            <td
                              key={column.key}
                              className={`py-2.5 px-3 ${
                                column.align === 'center' ? 'text-center font-mono' : ''
                              }`}
                            >
                              {row[column.key] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-3">
            <Download className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              ملف Excel يحتوي البيانات المطابقة فقط. زر الطباعة يفتح نسخة A4 عربية (RTL) بدون شريط
              التنقل، ويمكن اختيار «حفظ كـ PDF» من نافذة الطباعة.
            </span>
          </div>
        </>
      )}
    </div>
  );
};

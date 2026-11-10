/**
 * SMD - Suez Methanol Derivatives Co.
 * Main Dashboard View with Core Leave Balances Widget & KPIs
 */

import React from 'react';
import { 
  Employee, 
  AttendanceRecord, 
  LeaveBalance, 
  ZKTecoDevice,
  UserSession 
} from '../types';
import { 
  Users, 
  Clock, 
  Calendar, 
  Briefcase, 
  Cpu, 
  Download, 
  ArrowUpRight, 
  AlertCircle,
  Building,
  CheckCircle2,
  ChevronLeft
} from 'lucide-react';
import { exportLeaveBalancesToExcel, exportAttendanceToExcel } from '../utils/fileExport';

interface DashboardProps {
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaveBalances: LeaveBalance[];
  devices: ZKTecoDevice[];
  user: UserSession;
  onSelectEmployee: (employeeId: string) => void;
  onNavigateTab: (tab: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  employees,
  attendance,
  leaveBalances,
  devices,
  user,
  onSelectEmployee,
  onNavigateTab
}) => {
  // Compute Key Metrics
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.isActive).length;
  const todayAttendance = attendance.filter(a => a.date === '2026-11-01' || a.date === '2026-11-02');
  const presentCount = todayAttendance.filter(a => a.status === 'حاضر' || a.status === 'إضافي').length;
  
  const totalOvertimeHours = attendance.reduce((sum, a) => sum + (a.overtimeHoursTotal || 0), 0);
  const totalDayOT = attendance.reduce((sum, a) => sum + (a.dayOvertimeHours || 0), 0);
  const totalNightOT = attendance.reduce((sum, a) => sum + (a.nightOvertimeHours || 0), 0);
  const totalOTPay = attendance.reduce((sum, a) => sum + (a.totalOvertimePay || 0), 0);

  const connectedDevicesCount = devices.filter(d => d.status === 'connected').length;

  const empMap = new Map(employees.map(e => [e.employeeId, e]));

  return (
    <div className="space-y-6">
      
      {/* Top Welcome & Notification Banner with Prominent Large SMD Logo */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden border border-blue-900/40">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-2xl p-2 border-2 border-blue-400/50 shadow-xl flex items-center justify-center shrink-0">
              <img 
                src="/logo.png" 
                alt="شعار شركة السويس لمشتقات الميثانول - SMD" 
                className="w-full h-full object-contain filter drop-shadow-xs"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-semibold mb-2">
                <span>شركة السويس لمشتقات الميثانول - مصنع السويس</span>
                <span>·</span>
                <span>خادم محلي مؤمن</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                مرحباً، {user.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                منظومة الموارد البشرية المركزية، سحب بيانات ZKTeco، استيراد الكشوف بالتصوير، وحساب الإضافي.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigateTab('zkteco')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Cpu className="w-4 h-4" />
              <span>مزامنة أجهزة البصمة</span>
            </button>
            <button
              onClick={() => onNavigateTab('overtime')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Clock className="w-4 h-4" />
              <span>حاسبة الإضافي (6م)</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Employees */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي قوة العمل</span>
            <span className="p-2 bg-blue-50 text-blue-700 rounded-lg">
              <Users className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-mono tabular-nums">{totalEmployees}</span>
            <span className="text-xs font-medium text-slate-500">موظف مسجل</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="text-emerald-700 font-bold font-mono">{activeEmployees}</span>
            <span>على رأس العمل في مصنع السويس والإدارة</span>
          </div>
        </div>

        {/* Card 2: Attendance Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">حضور اليوم (البصمة)</span>
            <span className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
              <CheckCircle2 className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-mono tabular-nums">{presentCount}</span>
            <span className="text-xs font-medium text-slate-500">من إجمالي المستهدف</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="text-blue-700 font-bold font-mono">
              {totalEmployees > 0 ? ((presentCount / totalEmployees) * 100).toFixed(0) : 0}%
            </span>
            <span>نسبة التواجد الميداني اليومي</span>
          </div>
        </div>

        {/* Card 3: Overtime Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">إجمالي الساعات الإضافية</span>
            <span className="p-2 bg-amber-50 text-amber-700 rounded-lg">
              <Clock className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-mono tabular-nums">{totalOvertimeHours.toFixed(1)}</span>
            <span className="text-xs font-medium text-slate-500">ساعة إضافية</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <span className="text-amber-700 font-semibold font-mono">نهاري (1.35): {totalDayOT.toFixed(1)}س</span>
            <span>·</span>
            <span className="text-indigo-700 font-semibold font-mono">ليلي (1.70): {totalNightOT.toFixed(1)}س</span>
          </div>
        </div>

        {/* Card 4: ZKTeco Connectivity */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">أجهزة البصمة ZKTeco</span>
            <span className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <Cpu className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-mono tabular-nums">{connectedDevicesCount}/{devices.length}</span>
            <span className="text-xs font-medium text-emerald-600 font-bold">متصل بالشبكة</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 truncate">
            <span>آخر مزامنة عبر TCP/IP: </span>
            <span className="font-mono text-slate-700">{devices[0]?.lastSync?.split(' ')[1] || '08:30'}</span>
          </div>
        </div>

      </div>

      {/* CORE REQUIREMENT: LEAVE WIDGET */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-700" />
              <h2 className="text-sm font-bold text-slate-900">
                أرصدة إجازات العاملين (Leave Widget)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              متابعة الأرصدة الافتتاحية والمتبقية (اعتيادي، عارضة، مرضي دورة 3 سنوات قانون العمل)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportLeaveBalancesToExcel(leaveBalances, employees)}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>تصدير إلى Excel</span>
            </button>
            <button
              onClick={() => onNavigateTab('leaves')}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>سجل الإجازات التفصيلي</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Leave Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">كود الموظف</th>
                <th className="py-3 px-4">اسم الموظف</th>
                <th className="py-3 px-4">المسمى الوظيفي</th>
                <th className="py-3 px-4">الإدارة / القطاع</th>
                <th className="py-3 px-3 text-center bg-blue-50/50">اعتيادي (افتتاحي / متبقي)</th>
                <th className="py-3 px-3 text-center bg-amber-50/50">عارضة (افتتاحي / متبقي)</th>
                <th className="py-3 px-3 text-center bg-rose-50/50">مرضي (دورة 3 سنوات: 90 يوم)</th>
                <th className="py-3 px-4 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {leaveBalances.map((bal) => {
                const emp = empMap.get(bal.employeeId);
                const remAnnual = Math.max(0, bal.annualOpening - bal.annualUsed);
                const remCasual = Math.max(0, bal.casualOpening - bal.casualUsed);
                const remSick = Math.max(0, bal.sickOpening - bal.sickUsed);

                return (
                  <tr key={bal.employeeId} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {bal.employeeId}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      <button
                        onClick={() => onSelectEmployee(bal.employeeId)}
                        className="hover:text-blue-700 hover:underline cursor-pointer text-right"
                      >
                        {emp?.name || `موظف ${bal.employeeId}`}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {emp?.currentTitle || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={emp?.department}>
                      {emp?.department || '—'}
                    </td>
                    
                    {/* Annual balance */}
                    <td className="py-3 px-3 text-center font-mono">
                      <span className="text-slate-400">{bal.annualOpening}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className={`font-bold ${remAnnual <= 5 ? 'text-amber-600' : 'text-blue-700'}`}>
                        {remAnnual} يوم
                      </span>
                    </td>

                    {/* Casual balance */}
                    <td className="py-3 px-3 text-center font-mono">
                      <span className="text-slate-400">{bal.casualOpening}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className={`font-bold ${remCasual <= 2 ? 'text-amber-600' : 'text-emerald-700'}`}>
                        {remCasual} يوم
                      </span>
                    </td>

                    {/* Sick balance */}
                    <td className="py-3 px-3 text-center font-mono">
                      <span className="text-slate-400">{bal.sickOpening}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className="font-bold text-slate-800">
                        {remSick} يوم
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        دورة {bal.sickCycleStartYear}-{bal.sickCycleStartYear + 3}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => onSelectEmployee(bal.employeeId)}
                        className="px-2 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white rounded text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                      >
                        الملف الكامل
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Two Column Grid: Today's Overtime Feed & Quick ZKTeco Hardware Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Box 1: Recent Attendance & Overtime Logs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-900">
                سجلات العمل الإضافي المعتمدة (قاعدة 6:00 م)
              </h3>
            </div>
            <button
              onClick={() => exportAttendanceToExcel(attendance, employees)}
              className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              تصدير التقرير
            </button>
          </div>

          <div className="divide-y divide-slate-100 mt-2">
            {attendance.slice(0, 4).map((att) => {
              const emp = empMap.get(att.employeeId);
              return (
                <div key={att.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{emp?.name}</span>
                      <span className="text-slate-400 font-mono">({att.employeeId})</span>
                    </div>
                    <div className="text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>حضور: <strong className="font-mono text-slate-700">{att.checkIn}</strong></span>
                      <span>·</span>
                      <span>انصراف: <strong className="font-mono text-slate-700">{att.checkOut}</strong></span>
                      <span>·</span>
                      <span className="text-blue-700 font-medium">
                        {att.shiftType === 'NORMAL_DAY' ? 'يوم عادي' : att.shiftType === 'DAY_SHIFT' ? 'وردية نهارية' : 'وردية ليلية'}
                      </span>
                    </div>
                  </div>

                  <div className="text-left font-mono shrink-0">
                    {att.overtimeHoursTotal > 0 ? (
                      <div>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded text-xs">
                          +{att.overtimeHoursTotal}س إضافي
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {att.dayOvertimeHours > 0 && `نهار: ${att.dayOvertimeHours}س (1.35) `}
                          {att.nightOvertimeHours > 0 && `ليل: ${att.nightOvertimeHours}س (1.70)`}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs font-sans">بدون إضافي</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 bg-slate-50 -mx-5 -mb-5 p-3 rounded-b-xl flex items-center justify-between text-xs text-slate-600">
            <span>قاعدة الاحتساب: قبل 6:00 م معدل 1.35 · بعد 6:00 م حتى 6:00 ص معدل 1.70</span>
            <button
              onClick={() => onNavigateTab('overtime')}
              className="text-blue-700 font-bold hover:underline cursor-pointer"
            >
              افتح الحاسبة
            </button>
          </div>
        </div>

        {/* Box 2: ZKTeco Terminal Monitor */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-700" />
              <h3 className="text-sm font-bold text-slate-900">
                حالة أجهزة البصمة ZKTeco بالشبكة المحلية
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('zkteco')}
              className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              إدارة الأجهزة
            </button>
          </div>

          <div className="space-y-3 mt-3">
            {devices.map((dev) => (
              <div key={dev.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{dev.name}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px]">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>متصل TCP/IP</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 text-slate-600">
                  <div>
                    <span>عنوان IP: </span>
                    <strong className="font-mono text-slate-800" dir="ltr">{dev.ipAddress}:{dev.port}</strong>
                  </div>
                  <div>
                    <span>الموقع: </span>
                    <span className="text-slate-800">{dev.location}</span>
                  </div>
                  <div>
                    <span>المستخدمون: </span>
                    <strong className="font-mono text-slate-800">{dev.totalUsers} موظف</strong>
                  </div>
                  <div>
                    <span>سجلات البصمة: </span>
                    <strong className="font-mono text-slate-800">{dev.totalLogs} حركة</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>بروتوكول الاتصال: pyzk SDK / Standalone TCP Socket</span>
            <span className="text-emerald-700 font-semibold">جاهز لمزامنة الحركات</span>
          </div>
        </div>

      </div>

    </div>
  );
};

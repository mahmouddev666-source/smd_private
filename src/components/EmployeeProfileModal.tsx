/**
 * SMD - Suez Methanol Derivatives Co.
 * Comprehensive Employee Profile Modal
 * Shows complete history: Attendance, Overtime, Leaves, Permits, Missions & Documents
 */

import React, { useState } from 'react';
import { 
  Employee, 
  AttendanceRecord, 
  LeaveRecord, 
  LeaveBalance, 
  PermitRecord, 
  MissionRecord 
} from '../types';
import { 
  X, 
  User, 
  Calendar, 
  Clock, 
  Briefcase, 
  FileText, 
  IdCard, 
  Phone, 
  Mail, 
  Building, 
  MapPin, 
  ShieldCheck, 
  Award,
  Download,
  Plus
} from 'lucide-react';
import { exportToWordDocument } from '../utils/fileExport';

interface EmployeeProfileModalProps {
  employee: Employee;
  balance?: LeaveBalance;
  attendance: AttendanceRecord[];
  leaves: LeaveRecord[];
  permits: PermitRecord[];
  missions: MissionRecord[];
  onClose: () => void;
  onOpenSmartForm?: (type: 'leave' | 'permit' | 'mission', employeeId: string) => void;
}

export const EmployeeProfileModal: React.FC<EmployeeProfileModalProps> = ({
  employee,
  balance,
  attendance,
  leaves,
  permits,
  missions,
  onClose,
  onOpenSmartForm
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'attendance' | 'leaves' | 'permits_missions'>('overview');

  // Filter records for this employee
  const empAttendance = attendance.filter(a => a.employeeId === employee.employeeId);
  const empLeaves = leaves.filter(l => l.employeeId === employee.employeeId);
  const empPermits = permits.filter(p => p.employeeId === employee.employeeId);
  const empMissions = missions.filter(m => m.employeeId === employee.employeeId);

  const totalEmpOvertime = empAttendance.reduce((acc, curr) => acc + (curr.overtimeHoursTotal || 0), 0);
  const totalDayOT = empAttendance.reduce((acc, curr) => acc + (curr.dayOvertimeHours || 0), 0);
  const totalNightOT = empAttendance.reduce((acc, curr) => acc + (curr.nightOvertimeHours || 0), 0);
  const totalOTPay = empAttendance.reduce((acc, curr) => acc + (curr.totalOvertimePay || 0), 0);

  const remAnnual = balance ? Math.max(0, balance.annualOpening - balance.annualUsed) : 0;
  const remCasual = balance ? Math.max(0, balance.casualOpening - balance.casualUsed) : 0;
  const remSick = balance ? Math.max(0, balance.sickOpening - balance.sickUsed) : 0;

  const handleExportDossierWord = () => {
    const html = `
      <div style="direction: rtl; text-align: right;">
        <h3 style="color: #0369a1;">بيان الحالة الوظيفية والسجل الشامل للموظف</h3>
        <table>
          <tr><th style="width: 25%;">كود الموظف</th><td>${employee.employeeId}</td><th>الرقم القومي</th><td>${employee.nationalId}</td></tr>
          <tr><th>الاسم بالكامل</th><td colspan="3">${employee.name}</td></tr>
          <tr><th>المسمى الوظيفي</th><td>${employee.currentTitle}</td><th>المسمى المكلف به</th><td>${employee.assignedTitle || '—'}</td></tr>
          <tr><th>الإدارة / القطاع</th><td>${employee.department}</td><th>الدرجة الوظيفية</th><td>${employee.grade}</td></tr>
          <tr><th>نوع العقد</th><td>${employee.contractType}</td><th>موقع العمل</th><td>${employee.workLocation}</td></tr>
          <tr><th>الرقم التأميني</th><td>${employee.insuranceId}</td><th>تاريخ التعيين</th><td>${employee.hireDate}</td></tr>
          <tr><th>أجر الساعة للإضافي</th><td>${employee.hourlyRate} ج.م</td><th>الوردية</th><td>${employee.defaultShift}</td></tr>
        </table>

        <h4 style="margin-top: 20px; color: #0369a1;">أرصدة الإجازات الحالية (سنة ${new Date().getFullYear()}):</h4>
        <table>
          <tr><th>نوع الإجازة</th><th>الرصيد الافتتاحي</th><th>المستهلك</th><th>المتبقي</th></tr>
          <tr><td>اعتيادي</td><td>${balance?.annualOpening || 0}</td><td>${balance?.annualUsed || 0}</td><td>${remAnnual}</td></tr>
          <tr><td>عارضة</td><td>${balance?.casualOpening || 0}</td><td>${balance?.casualUsed || 0}</td><td>${remCasual}</td></tr>
          <tr><td>مرضي (دورة 3 سنوات: ${balance?.sickCycleStartYear}-${(balance?.sickCycleStartYear || 2026) + 3})</td><td>${balance?.sickOpening || 90}</td><td>${balance?.sickUsed || 0}</td><td>${remSick}</td></tr>
        </table>
      </div>
    `;
    exportToWordDocument(
      `بيان_حالة_${employee.employeeId}_${employee.name.replace(/\s+/g, '_')}`,
      html,
      `بيان_حالة_${employee.employeeId}`
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 text-white shrink-0 relative">
          <button
            onClick={onClose}
            className="absolute left-5 top-5 p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-white p-1 shrink-0 border-2 border-blue-400/30 flex items-center justify-center overflow-hidden">
              <img 
                src={employee.photoUrl || '/logo.png'} 
                alt={employee.name} 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 font-mono text-xs rounded font-bold">
                  كود: {employee.employeeId}
                </span>
                <span className="text-xs text-slate-300">
                  {employee.contractType} · {employee.grade}
                </span>
              </div>
              <h2 className="text-xl font-black text-white mt-1">
                {employee.name}
              </h2>
              <p className="text-xs text-blue-200 font-medium">
                {employee.currentTitle} {employee.assignedTitle && `(مكلف بـ: ${employee.assignedTitle})`}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {employee.department} · {employee.workLocation}
              </p>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                onClick={handleExportDossierWord}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تصدير بيان الحالة (Word)</span>
              </button>
            </div>
          </div>

          {/* Sub-Tabs */}
          <div className="flex items-center gap-2 mt-5 border-t border-slate-800 pt-3 text-xs overflow-x-auto">
            <button
              onClick={() => setActiveSubTab('overview')}
              className={`py-1.5 px-3 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeSubTab === 'overview'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              البيانات الوظيفية والشخصية
            </button>
            <button
              onClick={() => setActiveSubTab('attendance')}
              className={`py-1.5 px-3 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeSubTab === 'attendance'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              سجل الحضور والإضافي ({empAttendance.length})
            </button>
            <button
              onClick={() => setActiveSubTab('leaves')}
              className={`py-1.5 px-3 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeSubTab === 'leaves'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              الأرصدة والإجازات ({empLeaves.length})
            </button>
            <button
              onClick={() => setActiveSubTab('permits_missions')}
              className={`py-1.5 px-3 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeSubTab === 'permits_missions'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              الأذونات والمأموريات ({empPermits.length + empMissions.length})
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: OVERVIEW */}
          {activeSubTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Quick Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-[11px] text-slate-500 block">رصيد اعتيادي متبقي</span>
                  <span className="text-xl font-black text-blue-700 font-mono">{remAnnual} يوم</span>
                  <span className="text-[10px] text-slate-400 block">من أصل {balance?.annualOpening || 0}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-[11px] text-slate-500 block">رصيد عارضة متبقي</span>
                  <span className="text-xl font-black text-emerald-700 font-mono">{remCasual} يوم</span>
                  <span className="text-[10px] text-slate-400 block">من أصل {balance?.casualOpening || 0}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-[11px] text-slate-500 block">مرضي (دورة 3 سنوات)</span>
                  <span className="text-xl font-black text-rose-700 font-mono">{remSick} يوم</span>
                  <span className="text-[10px] text-slate-400 block">مستهلك {balance?.sickUsed || 0} يوم</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                  <span className="text-[11px] text-slate-500 block">إجمالي الساعات الإضافية</span>
                  <span className="text-xl font-black text-amber-700 font-mono">{totalEmpOvertime.toFixed(1)} س</span>
                  <span className="text-[10px] text-slate-400 block">{totalOTPay.toFixed(0)} ج.م مستحق</span>
                </div>
              </div>

              {/* Detailed Tables */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-100 font-bold text-xs text-slate-800">
                  تفاصيل الرقم القومي والتأمينات والتعاقد
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">الرقم القومي (14 رقم):</span>
                    <strong className="font-mono text-slate-900">{employee.nationalId}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">الرقم التأميني:</span>
                    <strong className="font-mono text-slate-900">{employee.insuranceId}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">رقم الهاتف المحمول:</span>
                    <strong className="font-mono text-slate-900" dir="ltr">{employee.mobile}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">البريد الإلكتروني:</span>
                    <strong className="font-mono text-slate-900" dir="ltr">{employee.email || '—'}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">الوردية المقررة:</span>
                    <strong className="text-blue-700">
                      {employee.defaultShift === 'NORMAL_DAY' ? 'يوم عمل عادي (08:00 - 16:00)' : employee.defaultShift === 'DAY_SHIFT' ? 'وردية نهارية (08:00 - 20:00)' : 'وردية ليلية (20:00 - 08:00)'}
                    </strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">أجر الساعة للإضافي:</span>
                    <strong className="font-mono text-emerald-700">{employee.hourlyRate} ج.م / ساعة</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">تاريخ التعيين:</span>
                    <strong className="font-mono text-slate-900">{employee.hireDate}</strong>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500">موقع العمل:</span>
                    <strong className="text-slate-900">{employee.workLocation}</strong>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => onOpenSmartForm?.('leave', employee.employeeId)}
                  className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>تحرير طلب إجازة رسمي</span>
                </button>
                <button
                  onClick={() => onOpenSmartForm?.('permit', employee.employeeId)}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>تحرير إذن خروج</span>
                </button>
                <button
                  onClick={() => onOpenSmartForm?.('mission', employee.employeeId)}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>تحرير أمر مأمورية</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 2: ATTENDANCE & OVERTIME */}
          {activeSubTab === 'attendance' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                <div>
                  <span className="font-bold">إجمالي ساعات العمل الإضافي للموظف: </span>
                  <span className="font-mono font-bold text-sm">{totalEmpOvertime.toFixed(1)} ساعة</span>
                  <div className="text-[11px] text-amber-800 mt-1">
                    نهاري (قبل 6:00 م): <strong>{totalDayOT.toFixed(1)}س (معدل 1.35)</strong> · ليلي (بعد 6:00 م حتى 6:00 ص): <strong>{totalNightOT.toFixed(1)}س (معدل 1.70)</strong>
                  </div>
                </div>
                <div className="text-left font-mono">
                  <span className="text-[10px] text-amber-700 block">إجمالي المستحق المالي</span>
                  <span className="text-lg font-black text-amber-900">{totalOTPay.toFixed(2)} ج.م</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">التاريخ</th>
                      <th className="py-2.5 px-3">الوردية</th>
                      <th className="py-2.5 px-3 font-mono">حضور</th>
                      <th className="py-2.5 px-3 font-mono">انصراف</th>
                      <th className="py-2.5 px-3">ساعات العمل</th>
                      <th className="py-2.5 px-3 bg-amber-50/50">إضافي نهاري (1.35)</th>
                      <th className="py-2.5 px-3 bg-indigo-50/50">إضافي ليلي (1.70)</th>
                      <th className="py-2.5 px-3">قيمة الإضافي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {empAttendance.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-400">
                          لا توجد سجلات حضور مسجلة لهذا الموظف حتى الآن.
                        </td>
                      </tr>
                    ) : (
                      empAttendance.map(att => (
                        <tr key={att.id} className="hover:bg-slate-50 font-mono">
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-800">{att.date}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-600">
                            {att.shiftType === 'NORMAL_DAY' ? 'يوم عادي' : att.shiftType === 'DAY_SHIFT' ? 'وردية نهارية' : 'وردية ليلية'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{att.checkIn}</td>
                          <td className="py-2.5 px-3 text-slate-700">{att.checkOut}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{att.workingHours} س</td>
                          <td className="py-2.5 px-3 text-amber-700 font-bold bg-amber-50/30">
                            {att.dayOvertimeHours > 0 ? `${att.dayOvertimeHours} س` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-indigo-700 font-bold bg-indigo-50/30">
                            {att.nightOvertimeHours > 0 ? `${att.nightOvertimeHours} س` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-700 font-bold">
                            {att.totalOvertimePay > 0 ? `${att.totalOvertimePay} ج.م` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: LEAVES */}
          {activeSubTab === 'leaves' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <span className="text-xs text-blue-800 font-bold block">إجازة اعتيادية</span>
                  <span className="text-lg font-black text-blue-900 font-mono">{remAnnual} يوم متبقي</span>
                  <span className="text-[10px] text-blue-700 block">مستهلك: {balance?.annualUsed || 0} يوم</span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <span className="text-xs text-emerald-800 font-bold block">إجازة عارضة</span>
                  <span className="text-lg font-black text-emerald-900 font-mono">{remCasual} يوم متبقي</span>
                  <span className="text-[10px] text-emerald-700 block">مستهلك: {balance?.casualUsed || 0} يوم</span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-center">
                  <span className="text-xs text-rose-800 font-bold block">إجازة مرضية (دورة 3 سنوات)</span>
                  <span className="text-lg font-black text-rose-900 font-mono">{remSick} يوم متبقي</span>
                  <span className="text-[10px] text-rose-700 block">دورة {balance?.sickCycleStartYear}-{((balance?.sickCycleStartYear || 2026) + 3)}</span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">رقم الطلب</th>
                      <th className="py-2.5 px-3">نوع الإجازة</th>
                      <th className="py-2.5 px-3">الفترة (من - إلى)</th>
                      <th className="py-2.5 px-3">عدد الأيام</th>
                      <th className="py-2.5 px-3">السبب / الملاحظات</th>
                      <th className="py-2.5 px-3">المعتمد</th>
                      <th className="py-2.5 px-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {empLeaves.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          لا توجد إجازات مسجلة لهذا الموظف.
                        </td>
                      </tr>
                    ) : (
                      empLeaves.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{l.id}</td>
                          <td className="py-2.5 px-3 font-bold text-blue-700">{l.leaveType}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{l.startDate} إلى {l.endDate}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 font-mono">{l.daysCount} يوم</td>
                          <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{l.reason || l.notes || '—'}</td>
                          <td className="py-2.5 px-3 text-slate-700">{l.approvedBy || '—'}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[11px] font-bold">
                              {l.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: PERMITS & MISSIONS */}
          {activeSubTab === 'permits_missions' && (
            <div className="space-y-6">
              {/* Permits */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>الأذونات الشخصية وأذونات العمل ({empPermits.length})</span>
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">رقم الإذن</th>
                        <th className="py-2 px-3">النوع</th>
                        <th className="py-2 px-3">التاريخ</th>
                        <th className="py-2 px-3">الفترة</th>
                        <th className="py-2 px-3">المدة</th>
                        <th className="py-2 px-3">السبب</th>
                        <th className="py-2 px-3">الاعتماد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {empPermits.length === 0 ? (
                        <tr><td colSpan={7} className="py-4 text-center text-slate-400">لا توجد أذونات مسجلة.</td></tr>
                      ) : (
                        empPermits.map(p => (
                          <tr key={p.id}>
                            <td className="py-2 px-3 font-mono font-bold text-slate-700">{p.id}</td>
                            <td className="py-2 px-3 font-semibold text-blue-700">{p.permitType}</td>
                            <td className="py-2 px-3 font-mono text-slate-600">{p.date}</td>
                            <td className="py-2 px-3 font-mono text-slate-600">{p.startTime} - {p.endTime}</td>
                            <td className="py-2 px-3 font-bold font-mono">{p.durationHours} س</td>
                            <td className="py-2 px-3 text-slate-600 max-w-xs truncate">{p.reason}</td>
                            <td className="py-2 px-3 text-emerald-700 font-semibold">{p.approvedBy || 'معتمد'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Missions */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-amber-600" />
                  <span>المأموريات والتكليفات الرسمية ({empMissions.length})</span>
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">رقم المأمورية</th>
                        <th className="py-2 px-3">النوع</th>
                        <th className="py-2 px-3">الجهة والهدف</th>
                        <th className="py-2 px-3">الفترة والأيام</th>
                        <th className="py-2 px-3">البدل المستحق</th>
                        <th className="py-2 px-3">وسيلة الانتقال</th>
                        <th className="py-2 px-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {empMissions.length === 0 ? (
                        <tr><td colSpan={7} className="py-4 text-center text-slate-400">لا توجد مأموريات مسجلة.</td></tr>
                      ) : (
                        empMissions.map(m => (
                          <tr key={m.id}>
                            <td className="py-2 px-3 font-mono font-bold text-slate-700">{m.id}</td>
                            <td className="py-2 px-3 font-semibold text-amber-800">{m.missionType}</td>
                            <td className="py-2 px-3">
                              <span className="font-bold text-slate-800">{m.destination}</span>
                              <span className="text-[10px] text-slate-500 block">{m.purpose}</span>
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600">
                              {m.startDate} ({m.daysCount} أيام)
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-emerald-700">
                              {m.totalAllowance ? `${m.totalAllowance} ج.م` : 'بدون بدل مالي'}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{m.transportationType}</td>
                            <td className="py-2 px-3 text-emerald-700 font-semibold">{m.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

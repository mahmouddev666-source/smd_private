/**
 * SMD - Suez Methanol Derivatives Co.
 * Departmental Analysis & Reports (All 17 Exact Sectors & Departments)
 */

import React, { useState } from 'react';
import { 
  Employee, 
  AttendanceRecord, 
  LeaveRecord, 
  MissionRecord, 
  SMD_DEPARTMENTS 
} from '../types';
import { 
  BarChart3, 
  Building2, 
  Clock, 
  Calendar, 
  Briefcase, 
  Download, 
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { exportToExcel } from '../utils/fileExport';

interface DepartmentReportsProps {
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRecord[];
  missions: MissionRecord[];
}

export const DepartmentReports: React.FC<DepartmentReportsProps> = ({
  employees,
  attendance,
  leaves,
  missions
}) => {
  const [selectedMetric, setSelectedMetric] = useState<'overtime' | 'leaves' | 'missions'>('overtime');

  const empMap = new Map(employees.map(e => [e.employeeId, e]));

  // Aggregate stats per department across all 17 departments
  const departmentStats = SMD_DEPARTMENTS.map(dept => {
    const deptEmployees = employees.filter(e => e.department === dept);
    const empIds = new Set(deptEmployees.map(e => e.employeeId));

    const deptAttendance = attendance.filter(a => empIds.has(a.employeeId));
    const totalWorkingHours = deptAttendance.reduce((sum, a) => sum + (a.workingHours || 0), 0);
    const totalOvertime = deptAttendance.reduce((sum, a) => sum + (a.overtimeHoursTotal || 0), 0);
    const dayOT = deptAttendance.reduce((sum, a) => sum + (a.dayOvertimeHours || 0), 0);
    const nightOT = deptAttendance.reduce((sum, a) => sum + (a.nightOvertimeHours || 0), 0);
    const overtimePay = deptAttendance.reduce((sum, a) => sum + (a.totalOvertimePay || 0), 0);

    const deptLeaves = leaves.filter(l => empIds.has(l.employeeId));
    const totalLeaveDays = deptLeaves.reduce((sum, l) => sum + (l.daysCount || 0), 0);

    const deptMissions = missions.filter(m => empIds.has(m.employeeId));
    const missionCount = deptMissions.length;
    const missionAllowances = deptMissions.reduce((sum, m) => sum + (m.totalAllowance || 0), 0);

    return {
      department: dept,
      employeeCount: deptEmployees.length,
      attendanceRecords: deptAttendance.length,
      totalWorkingHours: Number(totalWorkingHours.toFixed(1)),
      totalOvertime: Number(totalOvertime.toFixed(1)),
      dayOT: Number(dayOT.toFixed(1)),
      nightOT: Number(nightOT.toFixed(1)),
      overtimePay: Number(overtimePay.toFixed(2)),
      totalLeaveDays,
      missionCount,
      missionAllowances
    };
  });

  const handleExportDeptExcel = () => {
    const rows = departmentStats.map(s => ({
      'الإدارة / القطاع': s.department,
      'عدد الموظفين': s.employeeCount,
      'إجمالي ساعات العمل': s.totalWorkingHours,
      'إجمالي الساعات الإضافية': s.totalOvertime,
      'إضافي نهاري (1.35)': s.dayOT,
      'إضافي ليلي (1.70)': s.nightOT,
      'مستحقات الإضافي (ج.م)': s.overtimePay,
      'أيام الإجازات المستهلكة': s.totalLeaveDays,
      'عدد المأموريات': s.missionCount,
      'بدلات المأموريات (ج.م)': s.missionAllowances
    }));
    exportToExcel(rows, `التقرير_القطاعي_SMD_${new Date().toISOString().split('T')[0]}`, 'التقرير القطاعي');
  };

  // Find max values for visual bars
  const maxOvertime = Math.max(...departmentStats.map(s => s.totalOvertime), 1);
  const maxLeaves = Math.max(...departmentStats.map(s => s.totalLeaveDays), 1);
  const maxMissions = Math.max(...departmentStats.map(s => s.missionCount), 1);

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            التحليل القطاعي وتقارير الإدارات (17 قطاع وإدارة)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            مؤشرات توزيع ساعات العمل، الإضافي (نهاري/ليلي)، الإجازات، وبدلات المأموريات بكل قطاع
          </p>
        </div>

        <button
          onClick={handleExportDeptExcel}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer self-start md:self-auto"
        >
          <Download className="w-4 h-4 text-slate-500" />
          <span>تصدير التقرير القطاعي (Excel)</span>
        </button>
      </div>

      {/* Visual Comparison Section */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">
            مقارنة أداء القطاعات والإدارات
          </h3>
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setSelectedMetric('overtime')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                selectedMetric === 'overtime' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              الساعات الإضافية (س)
            </button>
            <button
              onClick={() => setSelectedMetric('leaves')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                selectedMetric === 'leaves' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              أيام الإجازات
            </button>
            <button
              onClick={() => setSelectedMetric('missions')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                selectedMetric === 'missions' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              المأموريات والبدلات
            </button>
          </div>
        </div>

        {/* Visual Graph Bars */}
        <div className="space-y-3 pt-2">
          {departmentStats
            .filter(s => s.employeeCount > 0 || s.totalOvertime > 0 || s.totalLeaveDays > 0)
            .map(s => {
              const val = selectedMetric === 'overtime' ? s.totalOvertime : selectedMetric === 'leaves' ? s.totalLeaveDays : s.missionCount;
              const max = selectedMetric === 'overtime' ? maxOvertime : selectedMetric === 'leaves' ? maxLeaves : maxMissions;
              const pct = Math.max(5, (val / max) * 100);

              return (
                <div key={s.department} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{s.department}</span>
                    <span className="font-mono font-bold text-blue-700">
                      {val} {selectedMetric === 'overtime' ? 'ساعة إضافية' : selectedMetric === 'leaves' ? 'يوم إجازة' : 'مأمورية'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedMetric === 'overtime' ? 'bg-amber-500' : selectedMetric === 'leaves' ? 'bg-blue-600' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Complete Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-900">
            جدول البيانات التفصيلية للقطاعات الـ 17
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">م</th>
                <th className="py-3 px-4">اسم الإدارة / القطاع</th>
                <th className="py-3 px-3 text-center">العاملين</th>
                <th className="py-3 px-3 font-mono text-center">ساعات العمل</th>
                <th className="py-3 px-3 font-mono text-center bg-amber-50/50">إجمالي الإضافي</th>
                <th className="py-3 px-3 font-mono text-center">نهاري (1.35)</th>
                <th className="py-3 px-3 font-mono text-center">ليلي (1.70)</th>
                <th className="py-3 px-3 font-mono text-center">تكلفة الإضافي</th>
                <th className="py-3 px-3 font-mono text-center">الإجازات</th>
                <th className="py-3 px-3 font-mono text-center">المأموريات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {departmentStats.map((s, idx) => (
                <tr key={s.department} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                  <td className="py-3 px-4 font-bold text-slate-900">{s.department}</td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-blue-700">
                    {s.employeeCount}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-slate-700">
                    {s.totalWorkingHours} س
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-amber-900 bg-amber-50/30">
                    {s.totalOvertime > 0 ? `${s.totalOvertime} س` : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-slate-600">
                    {s.dayOT > 0 ? `${s.dayOT} س` : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-slate-600">
                    {s.nightOT > 0 ? `${s.nightOT} س` : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-emerald-700">
                    {s.overtimePay > 0 ? `${s.overtimePay} ج.م` : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-blue-700">
                    {s.totalLeaveDays > 0 ? `${s.totalLeaveDays} يوم` : '—'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-slate-700">
                    {s.missionCount > 0 ? `${s.missionCount} مأمورية` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

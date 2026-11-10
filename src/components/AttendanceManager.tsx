/**
 * SMD - Suez Methanol Derivatives Co.
 * Attendance and Shifts Log Manager with 6:00 PM Overtime Division
 */

import React, { useState } from 'react';
import { 
  AttendanceRecord, 
  Employee, 
  ShiftType, 
  UserSession 
} from '../types';
import { 
  Clock, 
  Search, 
  Download, 
  Plus, 
  Filter, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  Camera,
  Upload
} from 'lucide-react';
import { exportAttendanceToExcel, parseExcelFile } from '../utils/fileExport';
import { calculateOvertime } from '../utils/overtimeCalculator';
import { PhotoImportModal } from './PhotoImportModal';

interface AttendanceManagerProps {
  attendance: AttendanceRecord[];
  employees: Employee[];
  user: UserSession;
  onAddAttendance: (record: Omit<AttendanceRecord, 'id'>) => void;
  onSelectEmployee: (employeeId: string) => void;
}

export const AttendanceManager: React.FC<AttendanceManagerProps> = ({
  attendance,
  employees,
  user,
  onAddAttendance,
  onSelectEmployee
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterShift, setFilterShift] = useState<string>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Record State
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.employeeId || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shiftType, setShiftType] = useState<ShiftType>('NORMAL_DAY');
  const [checkIn, setCheckIn] = useState('08:00');
  const [checkOut, setCheckOut] = useState('20:00');
  const [notes, setNotes] = useState('');

  const empMap = new Map(employees.map(e => [e.employeeId, e]));

  const filtered = attendance.filter(r => {
    const emp = empMap.get(r.employeeId);
    const matchesSearch = 
      r.employeeId.includes(searchTerm) ||
      (emp && emp.name.includes(searchTerm)) ||
      r.date.includes(searchTerm);
    const matchesShift = filterShift === 'ALL' || r.shiftType === filterShift;
    return matchesSearch && matchesShift;
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emp = empMap.get(selectedEmpId);
    const hourlyRate = emp?.hourlyRate || 85.0;

    const ot = calculateOvertime(shiftType, checkIn, checkOut, hourlyRate);

    onAddAttendance({
      employeeId: selectedEmpId,
      date,
      shiftType,
      checkIn,
      checkOut,
      workingHours: ot.actualWorkedHours,
      standardHours: ot.standardHours,
      overtimeHoursTotal: ot.totalOvertimeHours,
      dayOvertimeHours: ot.dayOvertimeHours,
      nightOvertimeHours: ot.nightOvertimeHours,
      dayOvertimePay: ot.dayOvertimePay,
      nightOvertimePay: ot.nightOvertimePay,
      totalOvertimePay: ot.totalOvertimePay,
      source: 'يدوي (معدل بواسطة المشرف)',
      status: ot.totalOvertimeHours > 0 ? 'إضافي' : 'حاضر',
      notes
    });

    setShowAddModal(false);
  };

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const excelInputRef = React.useRef<HTMLInputElement | null>(null);

  const handlePhotoImport = (rows: any[]) => {
    rows.forEach(r => {
      const emp = empMap.get(r.employeeId);
      const hourlyRate = emp?.hourlyRate || 85.0;
      const ot = calculateOvertime(r.shiftType || 'NORMAL_DAY', r.checkIn || '08:00', r.checkOut || '16:00', hourlyRate);

      onAddAttendance({
        employeeId: r.employeeId || '1001',
        date: r.date || new Date().toISOString().split('T')[0],
        shiftType: r.shiftType || 'NORMAL_DAY',
        checkIn: r.checkIn || '08:00',
        checkOut: r.checkOut || '16:00',
        workingHours: ot.actualWorkedHours,
        standardHours: ot.standardHours,
        overtimeHoursTotal: ot.totalOvertimeHours,
        dayOvertimeHours: ot.dayOvertimeHours,
        nightOvertimeHours: ot.nightOvertimeHours,
        dayOvertimePay: ot.dayOvertimePay,
        nightOvertimePay: ot.nightOvertimePay,
        totalOvertimePay: ot.totalOvertimePay,
        source: 'تصوير المستند (OCR Scan)',
        status: ot.totalOvertimeHours > 0 ? 'إضافي' : 'حاضر',
        notes: r.notes || 'مستورد آلياً عبر تصوير كشف البصمة'
      });
    });
    setImportSuccessMsg(`تم استيراد ${rows.length} حركة حضور بنجاح واحتساب الإضافي آلياً!`);
    setTimeout(() => setImportSuccessMsg(null), 3500);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        alert('الملف فارغ أو لا يحتوي على بيانات صالحة.');
        return;
      }
      let addedCount = 0;
      rows.forEach((r: any) => {
        const empId = String(r['كود الموظف'] || r['كود'] || r['Employee ID'] || r['employeeId'] || '1001');
        const checkInTime = String(r['حضور'] || r['Check In'] || r['وقت الحضور'] || '08:00');
        const checkOutTime = String(r['انصراف'] || r['Check Out'] || r['وقت الانصراف'] || '16:00');
        const recordDate = String(r['التاريخ'] || r['Date'] || new Date().toISOString().split('T')[0]);
        const shift = (r['الوردية']?.includes('نهار') ? 'DAY_SHIFT' : r['الوردية']?.includes('ليل') ? 'NIGHT_SHIFT' : 'NORMAL_DAY') as ShiftType;

        const emp = empMap.get(empId);
        const hourlyRate = emp?.hourlyRate || 85.0;
        const ot = calculateOvertime(shift, checkInTime, checkOutTime, hourlyRate);

        onAddAttendance({
          employeeId: empId,
          date: recordDate,
          shiftType: shift,
          checkIn: checkInTime,
          checkOut: checkOutTime,
          workingHours: ot.actualWorkedHours,
          standardHours: ot.standardHours,
          overtimeHoursTotal: ot.totalOvertimeHours,
          dayOvertimeHours: ot.dayOvertimeHours,
          nightOvertimeHours: ot.nightOvertimeHours,
          dayOvertimePay: ot.dayOvertimePay,
          nightOvertimePay: ot.nightOvertimePay,
          totalOvertimePay: ot.totalOvertimePay,
          source: 'استيراد ملف Excel',
          status: ot.totalOvertimeHours > 0 ? 'إضافي' : 'حاضر',
          notes: 'مستورد من ملف Excel / كشف الحضور'
        });
        addedCount++;
      });
      setImportSuccessMsg(`تم استيراد ${addedCount} حركة حضور بنجاح من ملف Excel!`);
      setTimeout(() => setImportSuccessMsg(null), 3500);
    } catch (err: any) {
      alert('حدث خطأ أثناء قراءة ملف الحضور: ' + (err.message || ''));
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Hidden Excel File Input */}
      <input
        ref={excelInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={handleExcelUpload}
      />

      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            سجل الحضور والانصراف والورديات
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            متابعة البصمات الواردة من ZKTeco مع استيراد الكشوف الورقية بالتصوير وتطبيق قاعدة الـ 6:00 م
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          
          {/* CAMERA / PHOTO IMPORT BUTTON */}
          <button
            onClick={() => setShowPhotoModal(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="تصوير كشف الحضور الورقي واستخراج الحركات والإضافي آلياً"
          >
            <Camera className="w-4 h-4 text-cyan-200" />
            <span>استيراد بالتصوير (كاميرا)</span>
          </button>

          {/* EXCEL IMPORT BUTTON */}
          <button
            onClick={() => excelInputRef.current?.click()}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="استيراد سجلات الحضور من ملف Excel أو CSV"
          >
            <Upload className="w-4 h-4 text-slate-600" />
            <span>استيراد Excel</span>
          </button>

          {/* EXCEL EXPORT BUTTON */}
          <button
            onClick={() => exportAttendanceToExcel(attendance, employees)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>تصدير Excel</span>
          </button>

          {/* ADD RECORD BUTTON */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل حركة حضور / إضافي</span>
          </button>
        </div>
      </div>

      {importSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{importSuccessMsg}</span>
        </div>
      )}

      {/* Photo Import Modal for Attendance */}
      {showPhotoModal && (
        <PhotoImportModal
          domain="attendance"
          title="استيراد كشف الحضور والانصراف عن طريق التصوير (كاميرا / OCR)"
          description="قم بتصوير كشف البصمات أو توقيعات الحضور الورقي، وسيقوم النظام بمسح الساعات وحساب الإضافي تلقائياً وفقاً لقاعدة الـ 6:00 م."
          onClose={() => setShowPhotoModal(false)}
          onImportData={handlePhotoImport}
        />
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="البحث باسم الموظف أو الكود أو التاريخ..."
            className="w-full pr-10 pl-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-right"
          />
        </div>

        <div className="w-full md:w-64">
          <select
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-right"
          >
            <option value="ALL">جميع الورديات</option>
            <option value="NORMAL_DAY">يوم عمل عادي (08:00 - 16:00)</option>
            <option value="DAY_SHIFT">وردية نهارية (08:00 - 20:00)</option>
            <option value="NIGHT_SHIFT">وردية ليلية (20:00 - 08:00)</option>
          </select>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">التاريخ</th>
                <th className="py-3 px-3">كود الموظف</th>
                <th className="py-3 px-4">اسم الموظف والإدارة</th>
                <th className="py-3 px-3">الوردية</th>
                <th className="py-3 px-3 font-mono">حضور</th>
                <th className="py-3 px-3 font-mono">انصراف</th>
                <th className="py-3 px-3 font-mono">ساعات العمل</th>
                <th className="py-3 px-3 font-mono bg-amber-50/50">إضافي نهاري (1.35)</th>
                <th className="py-3 px-3 font-mono bg-indigo-50/50">إضافي ليلي (1.70)</th>
                <th className="py-3 px-3 font-mono">قيمة الإضافي</th>
                <th className="py-3 px-3">المصدر</th>
                <th className="py-3 px-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400">
                    لا توجد سجلات حضور مطابقة لشروط البحث.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const emp = empMap.get(r.employeeId);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-semibold text-slate-800">
                        {r.date}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-700">
                        {r.employeeId}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onSelectEmployee(r.employeeId)}
                          className="font-bold text-slate-900 hover:text-blue-700 cursor-pointer text-right block"
                        >
                          {emp?.name || `موظف ${r.employeeId}`}
                        </button>
                        <span className="text-[10px] text-slate-500 block truncate max-w-xs">
                          {emp?.department}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-slate-700">
                          {r.shiftType === 'NORMAL_DAY' ? 'يوم عادي' : r.shiftType === 'DAY_SHIFT' ? 'وردية نهارية' : 'وردية ليلية'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {r.checkIn}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {r.checkOut}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {r.workingHours} س
                      </td>

                      {/* Day Overtime (< 18:00) */}
                      <td className="py-3 px-3 font-mono bg-amber-50/30">
                        {r.dayOvertimeHours > 0 ? (
                          <span className="font-bold text-amber-900">
                            {r.dayOvertimeHours} س
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Night Overtime (18:00 -> 06:00) */}
                      <td className="py-3 px-3 font-mono bg-indigo-50/30">
                        {r.nightOvertimeHours > 0 ? (
                          <span className="font-bold text-indigo-900">
                            {r.nightOvertimeHours} س
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Total Pay */}
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                        {r.totalOvertimePay > 0 ? `${r.totalOvertimePay} ج.م` : '—'}
                      </td>

                      <td className="py-3 px-3 text-slate-500 text-[11px]">
                        {r.source.includes('ZKTeco') ? 'جهاز البصمة' : 'إدخال يدوي'}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          r.status === 'إضافي'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Attendance Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                تسجيل حركة حضور وانصراف (تطبيق خوارزمية 6:00 م)
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اختر الموظف
                </label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  {employees.map(e => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {e.employeeId} - {e.name} ({e.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    الوردية
                  </label>
                  <select
                    value={shiftType}
                    onChange={(e) => setShiftType(e.target.value as ShiftType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="NORMAL_DAY">يوم عادي (08:00 - 16:00)</option>
                    <option value="DAY_SHIFT">وردية نهارية (08:00 - 20:00)</option>
                    <option value="NIGHT_SHIFT">وردية ليلية (20:00 - 08:00)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    وقت الحضور
                  </label>
                  <input
                    type="time"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    وقت الانصراف
                  </label>
                  <input
                    type="time"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ملاحظات
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="سبب العمل الإضافي أو الملاحظة..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900 leading-relaxed">
                سيقوم النظام تلقائياً بتطبيق معادلة SMD: الساعات حتى 6:00 م تضرب في 1.35، والساعات من 6:00 م حتى 6:00 ص تضرب في 1.70.
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-lg shadow-sm"
                >
                  احتساب وحفظ السجل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

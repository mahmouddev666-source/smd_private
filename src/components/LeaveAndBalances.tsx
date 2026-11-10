/**
 * SMD - Suez Methanol Derivatives Co.
 * Leaves and Balances Management
 * (Annual, Casual, Sick 3-Year Cycle, Maternity, Hajj, Social, Unpaid)
 */

import React, { useState } from 'react';
import { 
  LeaveRecord, 
  LeaveBalance, 
  Employee, 
  LeaveType, 
  UserSession 
} from '../types';
import { 
  Calendar, 
  Search, 
  Download, 
  Plus, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  UserCheck,
  Camera,
  Upload
} from 'lucide-react';
import { exportLeaveBalancesToExcel, parseExcelFile } from '../utils/fileExport';
import { PhotoImportModal } from './PhotoImportModal';

interface LeaveAndBalancesProps {
  leaves: LeaveRecord[];
  balances: LeaveBalance[];
  employees: Employee[];
  user: UserSession;
  onAddLeave: (leave: Omit<LeaveRecord, 'id'>) => void;
  onSelectEmployee: (employeeId: string) => void;
}

const ALL_LEAVE_TYPES: LeaveType[] = [
  'اعتيادي',
  'عارضة',
  'عطلات رسمية',
  'مرضي',
  'وضع',
  'رعاية طفل',
  'حج وزيارة القدس',
  'امتحانات',
  'زواج',
  'وفاة',
  'أبوة',
  'بدون مرتب'
];

export const LeaveAndBalances: React.FC<LeaveAndBalancesProps> = ({
  leaves,
  balances,
  employees,
  user,
  onAddLeave,
  onSelectEmployee
}) => {
  const [activeTab, setActiveTab] = useState<'balances' | 'requests'>('balances');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Leave Form State
  const [empId, setEmpId] = useState(employees[0]?.employeeId || '');
  const [leaveType, setLeaveType] = useState<LeaveType>('اعتيادي');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [daysCount, setDaysCount] = useState(1);
  const [reason, setReason] = useState('');
  const [replacementEmpId, setReplacementEmpId] = useState('');

  const empMap = new Map(employees.map(e => [e.employeeId, e]));

  const filteredBalances = balances.filter(b => {
    const emp = empMap.get(b.employeeId);
    return b.employeeId.includes(searchTerm) || (emp && emp.name.includes(searchTerm));
  });

  const filteredLeaves = leaves.filter(l => {
    const emp = empMap.get(l.employeeId);
    return l.employeeId.includes(searchTerm) || (emp && emp.name.includes(searchTerm)) || l.leaveType.includes(searchTerm);
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddLeave({
      employeeId: empId,
      leaveType,
      startDate,
      endDate,
      daysCount: Number(daysCount),
      reason,
      replacementEmployeeId: replacementEmpId,
      status: 'معتمد',
      approvedBy: user.name,
      approvalDate: new Date().toISOString().split('T')[0]
    });
    setShowAddModal(false);
  };

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const excelInputRef = React.useRef<HTMLInputElement | null>(null);

  const handlePhotoImport = (rows: any[]) => {
    rows.forEach(r => {
      onAddLeave({
        employeeId: r.employeeId || '1004',
        leaveType: (r.leaveType as LeaveType) || 'اعتيادي',
        startDate: r.startDate || new Date().toISOString().split('T')[0],
        endDate: r.endDate || new Date().toISOString().split('T')[0],
        daysCount: Number(r.daysCount) || 1,
        reason: r.reason || 'مستورد ضوئياً من صورة نموذج طلب الإجازة',
        replacementEmployeeId: r.replacementEmployeeId || '',
        status: 'معتمد',
        approvedBy: user.name,
        approvalDate: new Date().toISOString().split('T')[0],
        notes: 'تم المسح الضوئي والاعتماد آلياً'
      });
    });
    setImportSuccessMsg(`تم استيراد ${rows.length} طلب إجازة بنجاح وخصمها من الأرصدة!`);
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
        const lType = (r['نوع الإجازة'] || r['Leave Type'] || 'اعتيادي') as LeaveType;
        const sDate = String(r['تاريخ البدء'] || r['Start Date'] || new Date().toISOString().split('T')[0]);
        const eDate = String(r['تاريخ الانتهاء'] || r['End Date'] || sDate);
        const days = Number(r['عدد الأيام'] || r['Days'] || 1);
        const reasonText = String(r['السبب'] || r['Reason'] || 'مستورد من ملف Excel');

        onAddLeave({
          employeeId: empId,
          leaveType: lType,
          startDate: sDate,
          endDate: eDate,
          daysCount: days,
          reason: reasonText,
          status: 'معتمد',
          approvedBy: user.name,
          approvalDate: new Date().toISOString().split('T')[0]
        });
        addedCount++;
      });
      setImportSuccessMsg(`تم استيراد ${addedCount} طلب إجازة بنجاح من ملف Excel!`);
      setTimeout(() => setImportSuccessMsg(null), 3500);
    } catch (err: any) {
      alert('حدث خطأ أثناء قراءة ملف الإجازات: ' + (err.message || ''));
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

      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            منظومة الإجازات والأرصدة القانونية بشركة SMD
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            متابعة أرصدة الاعتيادي والعارضة ودورة الإجازات المرضية كل 3 سنوات مع ميزة استيراد الطلبات بالتصوير
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          
          {/* CAMERA / PHOTO IMPORT BUTTON */}
          <button
            onClick={() => setShowPhotoModal(true)}
            className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            title="تصوير نموذج طلب الإجازة أو التقرير الطبي واستخراج البيانات آلياً"
          >
            <Camera className="w-4 h-4 text-cyan-200" />
            <span>استيراد بالتصوير (كاميرا)</span>
          </button>

          {/* EXCEL IMPORT BUTTON */}
          <button
            onClick={() => excelInputRef.current?.click()}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="استيراد إجازات من ملف Excel أو CSV"
          >
            <Upload className="w-4 h-4 text-slate-600" />
            <span>استيراد Excel</span>
          </button>

          {/* EXCEL EXPORT BUTTON */}
          <button
            onClick={() => exportLeaveBalancesToExcel(balances, employees)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>تصدير الأرصدة (Excel)</span>
          </button>

          {/* ADD LEAVE BUTTON */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>طلب إجازة جديد</span>
          </button>
        </div>
      </div>

      {importSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{importSuccessMsg}</span>
        </div>
      )}

      {/* Photo Import Modal for Leaves */}
      {showPhotoModal && (
        <PhotoImportModal
          domain="leaves"
          title="استيراد طلبات الإجازات عن طريق التصوير (كاميرا / OCR)"
          description="قم بتصوير نموذج طلب الإجازة الورقي أو التقرير الطبي، وسيقوم النظام باستخراج نوع الإجازة والفترة وخصمها من الرصيد تلقائياً."
          onClose={() => setShowPhotoModal(false)}
          onImportData={handlePhotoImport}
        />
      )}

      {/* Tabs Switcher: Balances vs Requests */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('balances')}
          className={`py-2 px-4 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'balances'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          أرصدة العاملين والدورات الثلاثية ({balances.length})
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`py-2 px-4 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'requests'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          سجل الإجازات المسجلة والمعتمدة ({leaves.length})
        </button>
      </div>

      {/* Search Input */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="البحث باسم الموظف، الكود، أو نوع الإجازة..."
            className="w-full pr-10 pl-4 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* TAB 1: BALANCES */}
      {activeTab === 'balances' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">كود</th>
                  <th className="py-3 px-4">اسم الموظف والإدارة</th>
                  <th className="py-3 px-3 text-center bg-blue-50/50">اعتيادي (افتتاحي / مستهلك / متبقي)</th>
                  <th className="py-3 px-3 text-center bg-emerald-50/50">عارضة (افتتاحي / مستهلك / متبقي)</th>
                  <th className="py-3 px-3 text-center bg-rose-50/50">مرضي (دورة 3 سنوات: 90 يوم)</th>
                  <th className="py-3 px-3 text-center">أخرى</th>
                  <th className="py-3 px-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredBalances.map(bal => {
                  const emp = empMap.get(bal.employeeId);
                  const remAnnual = Math.max(0, bal.annualOpening - bal.annualUsed);
                  const remCasual = Math.max(0, bal.casualOpening - bal.casualUsed);
                  const remSick = Math.max(0, bal.sickOpening - bal.sickUsed);

                  return (
                    <tr key={bal.employeeId} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-blue-700">{bal.employeeId}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onSelectEmployee(bal.employeeId)}
                          className="font-bold text-slate-900 hover:text-blue-700 cursor-pointer text-right block"
                        >
                          {emp?.name}
                        </button>
                        <span className="text-[10px] text-slate-500 block truncate max-w-xs">{emp?.department}</span>
                      </td>

                      {/* Annual */}
                      <td className="py-3 px-3 text-center font-mono bg-blue-50/20">
                        <span className="text-slate-400">{bal.annualOpening}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-slate-600">{bal.annualUsed}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="font-bold text-blue-700">{remAnnual} يوم</span>
                      </td>

                      {/* Casual */}
                      <td className="py-3 px-3 text-center font-mono bg-emerald-50/20">
                        <span className="text-slate-400">{bal.casualOpening}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-slate-600">{bal.casualUsed}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="font-bold text-emerald-700">{remCasual} يوم</span>
                      </td>

                      {/* Sick 3-year cycle */}
                      <td className="py-3 px-3 text-center font-mono bg-rose-50/20">
                        <span className="text-slate-400">{bal.sickOpening}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-rose-600">{bal.sickUsed}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="font-bold text-slate-800">{remSick} يوم</span>
                        <span className="text-[10px] text-slate-400 block font-sans">
                          الدورة: {bal.sickCycleStartYear} - {bal.sickCycleStartYear + 3}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center font-mono text-slate-500">
                        {bal.otherUsed} يوم
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => onSelectEmployee(bal.employeeId)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white rounded text-slate-700 text-xs font-medium transition-colors cursor-pointer"
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
      )}

      {/* TAB 2: REQUESTS HISTORY */}
      {activeTab === 'requests' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">رقم الطلب</th>
                  <th className="py-3 px-3">كود</th>
                  <th className="py-3 px-4">اسم الموظف</th>
                  <th className="py-3 px-3">نوع الإجازة</th>
                  <th className="py-3 px-3">الفترة (من - إلى)</th>
                  <th className="py-3 px-3">عدد الأيام</th>
                  <th className="py-3 px-4">الموظف البديل</th>
                  <th className="py-3 px-4">السبب / الملاحظات</th>
                  <th className="py-3 px-3">الاعتماد</th>
                  <th className="py-3 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLeaves.map(l => {
                  const emp = empMap.get(l.employeeId);
                  const rep = l.replacementEmployeeId ? empMap.get(l.replacementEmployeeId) : null;
                  return (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-700">{l.id}</td>
                      <td className="py-3 px-3 font-mono text-blue-700 font-bold">{l.employeeId}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{emp?.name}</td>
                      <td className="py-3 px-3 font-bold text-blue-700">{l.leaveType}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">{l.startDate} إلى {l.endDate}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">{l.daysCount} يوم</td>
                      <td className="py-3 px-4 text-slate-600">{rep ? rep.name : '—'}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{l.reason || l.notes || '—'}</td>
                      <td className="py-3 px-3 text-slate-700">{l.approvedBy || '—'}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[11px]">
                          {l.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Leave Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                تسجيل طلب إجازة رسمي جديد
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  الموظف طالب الإجازة *
                </label>
                <select
                  value={empId}
                  onChange={(e) => setEmpId(e.target.value)}
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
                    نوع الإجازة *
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    {ALL_LEAVE_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    عدد الأيام المطلوبة *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={daysCount}
                    onChange={(e) => setDaysCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    تاريخ البدء *
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    تاريخ الانتهاء *
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  الموظف البديل (تسليم المهام)
                </label>
                <select
                  value={replacementEmpId}
                  onChange={(e) => setReplacementEmpId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="">— اختياري / بدون بديل —</option>
                  {employees.filter(e => e.employeeId !== empId).map(e => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {e.name} ({e.currentTitle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  السبب أو الملاحظات
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="سبب طلب الإجازة أو رقم التقرير الطبي..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
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
                  اعتماد وخصم من الرصيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

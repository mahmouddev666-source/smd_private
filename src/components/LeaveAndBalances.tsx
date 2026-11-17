/**
 * SMD - Suez Methanol Derivatives Co.
 * Leaves and Balances Management
 * (Annual, Casual, Sick 3-Year Cycle, Maternity, Hajj, Social, Unpaid)
 */

import React, { useEffect, useState } from 'react';
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
  Upload,
  XCircle,
  ShieldCheck
} from 'lucide-react';
import { exportLeaveBalancesToExcel, parseExcelFile } from '../utils/fileExport';
import { localDateISO } from '../utils/dateUtils';
import { PhotoImportModal } from './PhotoImportModal';
import { canApprove, canEdit } from '../utils/roles';

interface LeaveAndBalancesProps {
  leaves: LeaveRecord[];
  balances: LeaveBalance[];
  employees: Employee[];
  user: UserSession;
  onAddLeave: (leave: Omit<LeaveRecord, 'id'>) => Promise<void>;
  onDecideLeave: (leaveId: string, status: 'معتمد' | 'مرفوض', notes?: string) => Promise<void>;
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
  onDecideLeave,
  onSelectEmployee
}) => {
  const [activeTab, setActiveTab] = useState<'balances' | 'requests'>('balances');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const userCanEdit = canEdit(user.role);
  const userCanApprove = canApprove(user.role);

  // Decision modal (approve with optional note / reject with a required reason).
  const [decision, setDecision] = useState<{ leave: LeaveRecord; status: 'معتمد' | 'مرفوض' } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

  const pendingCount = leaves.filter((leave) => leave.status === 'قيد المراجعة').length;

  useEffect(() => {
    if (!decision) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deciding) {
        setDecision(null);
        setDecisionError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [decision, deciding]);

  // New Leave Form State
  const [empId, setEmpId] = useState(employees[0]?.employeeId || '');
  const [leaveType, setLeaveType] = useState<LeaveType>('اعتيادي');
  const [startDate, setStartDate] = useState(localDateISO());
  const [endDate, setEndDate] = useState(localDateISO());
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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (saving) return;
    if (!empId) {
      setFormError('يرجى اختيار الموظف.');
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      setFormError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.');
      return;
    }
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const calendarDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (daysCount > calendarDays) {
      setFormError('عدد الأيام المطلوبة أكبر من الفترة المحددة.');
      return;
    }

    setSaving(true);
    try {
      await onAddLeave({
        employeeId: empId,
        leaveType,
        startDate,
        endDate,
        daysCount: Number(daysCount),
        reason,
        replacementEmployeeId: replacementEmpId,
        status: 'قيد المراجعة',
      });
      setShowAddModal(false);
      setFormError(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'تعذر حفظ طلب الإجازة.');
    } finally {
      setSaving(false);
    }
  };

  const openDecision = (leave: LeaveRecord, status: 'معتمد' | 'مرفوض') => {
    setDecision({ leave, status });
    setDecisionNotes('');
    setDecisionError(null);
  };

  const submitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision || deciding) return;
    if (decision.status === 'مرفوض' && !decisionNotes.trim()) {
      setDecisionError('يرجى إدخال سبب الرفض ليظهر للموظف في سجل الطلبات.');
      return;
    }
    setDeciding(true);
    setDecisionError(null);
    try {
      await onDecideLeave(decision.leave.id, decision.status, decisionNotes.trim());
      setDecision(null);
      setDecisionNotes('');
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'تعذر حفظ القرار.');
    } finally {
      setDeciding(false);
    }
  };

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);
  const excelInputRef = React.useRef<HTMLInputElement | null>(null);

  const knownEmployeeIds = new Set(employees.map(e => e.employeeId));

  const handlePhotoImport = async (rows: any[]) => {
    setImportErrorMsg(null);
    let addedCount = 0;
    for (const r of rows) {
      const employeeId = String(r.employeeId || '');
      if (!knownEmployeeIds.has(employeeId)) continue; // skip unknown employees
      try {
        await onAddLeave({
          employeeId,
          leaveType: (r.leaveType as LeaveType) || 'اعتيادي',
          startDate: r.startDate || localDateISO(),
          endDate: r.endDate || localDateISO(),
          daysCount: Number(r.daysCount) || 1,
          reason: r.reason || 'مستورد ضوئياً من صورة نموذج طلب الإجازة',
          replacementEmployeeId: r.replacementEmployeeId || '',
          status: 'قيد المراجعة',
          notes: 'تم المسح الضوئي — بانتظار اعتماد الموارد البشرية'
        });
        addedCount += 1;
      } catch {
        // Skip rows the server rejects (overlapping dates, exhausted balance…).
      }
    }
    setImportSuccessMsg(
      `تم استيراد ${addedCount} طلب إجازة بنجاح كطلبات قيد المراجعة` +
      (addedCount < rows.length ? ` — تم تجاهل ${rows.length - addedCount} صف لموظف غير مسجل أو غير صالح.` : '!'),
    );
    setTimeout(() => setImportSuccessMsg(null), 4500);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErrorMsg(null);
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        setImportErrorMsg('الملف فارغ أو لا يحتوي على بيانات صالحة.');
        return;
      }
      let addedCount = 0;
      for (const r of rows as any[]) {
        const empId = String(r['كود الموظف'] || r['كود'] || r['Employee ID'] || r['employeeId'] || '');
        if (!knownEmployeeIds.has(empId)) continue; // skip unknown employees
        const lType = (r['نوع الإجازة'] || r['Leave Type'] || 'اعتيادي') as LeaveType;
        const sDate = String(r['تاريخ البدء'] || r['Start Date'] || localDateISO());
        const eDate = String(r['تاريخ الانتهاء'] || r['End Date'] || sDate);
        const days = Number(r['عدد الأيام'] || r['Days'] || 1);
        const reasonText = String(r['السبب'] || r['Reason'] || 'مستورد من ملف Excel');

        try {
          await onAddLeave({
            employeeId: empId,
            leaveType: lType,
            startDate: sDate,
            endDate: eDate,
            daysCount: days,
            reason: reasonText,
            status: 'قيد المراجعة',
            notes: 'مستورد من ملف Excel — بانتظار اعتماد الموارد البشرية'
          });
          addedCount++;
        } catch {
          // Skip rows the server rejects (overlapping dates, exhausted balance…).
        }
      }
      setImportSuccessMsg(
        `تم استيراد ${addedCount} طلب إجازة بنجاح من ملف Excel` +
        (addedCount < rows.length ? ` — تم تجاهل ${rows.length - addedCount} صف لموظف غير مسجل أو بيانات غير صالحة.` : '!'),
      );
      setTimeout(() => setImportSuccessMsg(null), 4500);
    } catch (err: any) {
      setImportErrorMsg('حدث خطأ أثناء قراءة ملف الإجازات: ' + (err.message || ''));
    } finally {
      e.target.value = '';
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
          {userCanEdit && (
            <button
              onClick={() => setShowPhotoModal(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              title="تصوير نموذج طلب الإجازة أو التقرير الطبي واستخراج البيانات آلياً"
            >
              <Camera className="w-4 h-4 text-cyan-200" />
              <span>استيراد بالتصوير (كاميرا)</span>
            </button>
          )}

          {/* EXCEL IMPORT BUTTON */}
          {userCanEdit && (
            <button
              onClick={() => excelInputRef.current?.click()}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              title="استيراد إجازات من ملف Excel أو CSV"
            >
              <Upload className="w-4 h-4 text-slate-600" />
              <span>استيراد Excel</span>
            </button>
          )}

          {/* EXCEL EXPORT BUTTON */}
          <button
            onClick={() => exportLeaveBalancesToExcel(balances, employees)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>تصدير الأرصدة (Excel)</span>
          </button>

          {/* ADD LEAVE BUTTON */}
          {userCanEdit && (
            <button
              onClick={() => { setFormError(null); setShowAddModal(true); }}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>طلب إجازة جديد</span>
            </button>
          )}
        </div>
      </div>

      {importSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{importSuccessMsg}</span>
        </div>
      )}

      {importErrorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-300 text-rose-800 text-xs rounded-xl flex items-center gap-2 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-semibold">{importErrorMsg}</span>
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
          سجل الطلبات والاعتمادات ({leaves.length})
          {pendingCount > 0 && (
            <span className="mr-1.5 px-1.5 py-0.5 bg-amber-400 text-amber-950 rounded-full text-[10px] font-bold">
              {pendingCount} قيد المراجعة
            </span>
          )}
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
                  <th className="py-3 px-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLeaves.map(l => {
                  const emp = empMap.get(l.employeeId);
                  const rep = l.replacementEmployeeId ? empMap.get(l.replacementEmployeeId) : null;
                  const isPending = l.status === 'قيد المراجعة';
                  const statusClass =
                    l.status === 'معتمد'
                      ? 'bg-emerald-100 text-emerald-800'
                      : l.status === 'مرفوض'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800';
                  return (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-700">{l.id}</td>
                      <td className="py-3 px-3 font-mono text-blue-700 font-bold">{l.employeeId}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{emp?.name}</td>
                      <td className="py-3 px-3 font-bold text-blue-700">{l.leaveType}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">{l.startDate} إلى {l.endDate}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">{l.daysCount} يوم</td>
                      <td className="py-3 px-4 text-slate-600">{rep ? rep.name : '—'}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs">
                        <span className="block truncate">{l.reason || l.notes || '—'}</span>
                        {l.decisionNotes && (
                          <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                            قرار الإدارة: {l.decisionNotes}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700">{l.approvedBy || '—'}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${statusClass}`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {userCanApprove && isPending ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openDecision(l, 'معتمد')}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                              title="اعتماد الطلب وخصم الرصيد مرة واحدة"
                            >
                              اعتماد
                            </button>
                            <button
                              onClick={() => openDecision(l, 'مرفوض')}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                              title="رفض الطلب دون خصم الرصيد"
                            >
                              رفض
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {isPending ? 'بانتظار HR' : 'مكتمل'}
                          </span>
                        )}
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-modal-title"
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <h3 id="leave-modal-title" className="text-sm font-bold text-slate-900">
                تسجيل طلب إجازة رسمي جديد
              </h3>
              <button onClick={() => { setShowAddModal(false); setFormError(null); }} className="text-slate-400 hover:text-slate-600 font-bold" aria-label="إغلاق">
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

              {formError && (
                <div role="alert" className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-[11px] text-rose-800 leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setFormError(null); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:cursor-wait"
                >
                  {saving ? 'جارٍ تقديم الطلب...' : 'تقديم الطلب للمراجعة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve / reject decision modal */}
      {decision && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-decision-title"
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <h3 id="leave-decision-title" className="text-sm font-bold text-slate-900 flex items-center gap-2">
                {decision.status === 'معتمد' ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
                {decision.status === 'معتمد' ? 'اعتماد طلب الإجازة' : 'رفض طلب الإجازة'}
              </h3>
              <button
                onClick={() => { setDecision(null); setDecisionError(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 space-y-1">
              <p>
                <span className="font-bold">الموظف:</span>{' '}
                {empMap.get(decision.leave.employeeId)?.name || decision.leave.employeeId}
              </p>
              <p>
                <span className="font-bold">النوع:</span> {decision.leave.leaveType} —{' '}
                {decision.leave.daysCount} يوم
              </p>
              <p className="font-mono">
                {decision.leave.startDate} إلى {decision.leave.endDate}
              </p>
              {decision.status === 'معتمد' ? (
                <p className="text-emerald-700 font-semibold">
                  سيتم خصم الرصيد مرة واحدة فقط عند تأكيد الاعتماد.
                </p>
              ) : (
                <p className="text-rose-700 font-semibold">
                  لن يُخصم أي رصيد عند الرفض، وسيظهر سبب الرفض في السجل.
                </p>
              )}
            </div>

            <form onSubmit={submitDecision} className="space-y-4">
              <div>
                <label htmlFor="leave-decision-notes" className="block text-xs font-semibold text-slate-700 mb-1">
                  {decision.status === 'مرفوض' ? 'سبب الرفض *' : 'ملاحظات القرار (اختياري)'}
                </label>
                <textarea
                  id="leave-decision-notes"
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs resize-none"
                  placeholder={
                    decision.status === 'مرفوض'
                      ? 'مثال: تعارض مع احتياجات العمل أو عدم اكتمال المستندات...'
                      : 'أي ملاحظات تظهر مع القرار في سجل الطلبات.'
                  }
                />
              </div>

              {decisionError && (
                <div role="alert" className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-[11px] text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{decisionError}</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setDecision(null); setDecisionError(null); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={deciding}
                  className={`px-5 py-2 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-wait ${
                    decision.status === 'معتمد'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {deciding
                    ? 'جارٍ الحفظ...'
                    : decision.status === 'معتمد'
                      ? 'تأكيد الاعتماد'
                      : 'تأكيد الرفض'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

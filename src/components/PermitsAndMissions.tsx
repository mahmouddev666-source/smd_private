/**
 * SMD - Suez Methanol Derivatives Co.
 * Permits & Missions Management (Personal/Work Permits & Missions with Allowance)
 */

import React, { useState, useRef } from 'react';
import { 
  PermitRecord, 
  MissionRecord, 
  Employee, 
  PermitType, 
  MissionType, 
  UserSession 
} from '../types';
import { 
  Briefcase, 
  Clock, 
  Plus, 
  Search, 
  CheckCircle2, 
  MapPin, 
  Car, 
  DollarSign,
  Camera,
  Upload,
  Download
} from 'lucide-react';
import { PhotoImportModal } from './PhotoImportModal';
import { parseExcelFile, exportPermitsToExcel, exportMissionsToExcel } from '../utils/fileExport';

interface PermitsAndMissionsProps {
  permits: PermitRecord[];
  missions: MissionRecord[];
  employees: Employee[];
  user: UserSession;
  onAddPermit: (permit: Omit<PermitRecord, 'id'>) => void;
  onAddMission: (mission: Omit<MissionRecord, 'id'>) => void;
  onSelectEmployee: (employeeId: string) => void;
}

export const PermitsAndMissions: React.FC<PermitsAndMissionsProps> = ({
  permits,
  missions,
  employees,
  user,
  onAddPermit,
  onAddMission,
  onSelectEmployee
}) => {
  const [activeTab, setActiveTab] = useState<'permits' | 'missions'>('permits');
  const [showAddPermitModal, setShowAddPermitModal] = useState(false);
  const [showAddMissionModal, setShowAddMissionModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const excelFileRef = useRef<HTMLInputElement | null>(null);

  // Permit Form State
  const [pEmpId, setPEmpId] = useState(employees[0]?.employeeId || '');
  const [pType, setPType] = useState<PermitType>('إذن شخصي');
  const [pDate, setPDate] = useState(new Date().toISOString().split('T')[0]);
  const [pStart, setPStart] = useState('11:00');
  const [pEnd, setPEnd] = useState('13:00');
  const [pDuration, setPDuration] = useState(2);
  const [pReason, setPReason] = useState('');

  // Mission Form State
  const [mEmpId, setMEmpId] = useState(employees[0]?.employeeId || '');
  const [mType, setMType] = useState<MissionType>('مأمورية ببدل');
  const [mDestination, setMDestination] = useState('');
  const [mPurpose, setMPurpose] = useState('');
  const [mStart, setMStart] = useState(new Date().toISOString().split('T')[0]);
  const [mEnd, setMEnd] = useState(new Date().toISOString().split('T')[0]);
  const [mDays, setMDays] = useState(2);
  const [mAllowancePerDay, setMAllowancePerDay] = useState(450);
  const [mTransport, setMTransport] = useState<'سيارة الشركة' | 'قطار / حافلة' | 'طيران' | 'خاصة ببدل انتقال'>('سيارة الشركة');

  const empMap = new Map(employees.map(e => [e.employeeId, e]));

  const handlePermitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddPermit({
      employeeId: pEmpId,
      permitType: pType,
      date: pDate,
      startTime: pStart,
      endTime: pEnd,
      durationHours: Number(pDuration),
      reason: pReason,
      status: 'معتمد',
      approvedBy: user.name
    });
    setShowAddPermitModal(false);
    setPReason('');
  };

  const handleMissionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const total = mType === 'مأمورية ببدل' ? mDays * mAllowancePerDay : 0;
    onAddMission({
      employeeId: mEmpId,
      missionType: mType,
      destination: mDestination,
      purpose: mPurpose,
      startDate: mStart,
      endDate: mEnd,
      daysCount: Number(mDays),
      allowancePerDay: mType === 'مأمورية ببدل' ? mAllowancePerDay : 0,
      totalAllowance: total,
      transportationType: mTransport,
      status: 'معتمد',
      approvedBy: user.name
    });
    setShowAddMissionModal(false);
    setMDestination('');
    setMPurpose('');
  };

  const handlePhotoImport = (rows: any[]) => {
    if (activeTab === 'permits') {
      rows.forEach(r => {
        onAddPermit({
          employeeId: r.employeeId || employees[0]?.employeeId || '1001',
          permitType: r.permitType || 'إذن شخصي',
          date: r.date || new Date().toISOString().split('T')[0],
          startTime: r.startTime || '10:00',
          endTime: r.endTime || '12:00',
          durationHours: Number(r.durationHours) || 2,
          reason: r.reason || 'إذن مصور ومستخرج ضوئياً',
          status: 'معتمد',
          approvedBy: user.name
        });
      });
      setImportNotice(`تم استيراد ${rows.length} تصريح / إذن بنجاح عبر الكاميرا والمسح الضوئي.`);
    } else {
      rows.forEach(r => {
        onAddMission({
          employeeId: r.employeeId || employees[0]?.employeeId || '1001',
          missionType: r.missionType || 'مأمورية ببدل',
          destination: r.destination || 'موقع الشركة',
          purpose: r.purpose || 'مأمورية مستخرجة ضوئياً',
          startDate: r.startDate || new Date().toISOString().split('T')[0],
          endDate: r.endDate || new Date().toISOString().split('T')[0],
          daysCount: Number(r.daysCount) || 1,
          allowancePerDay: Number(r.allowancePerDay) || 450,
          totalAllowance: Number(r.totalAllowance) || (Number(r.daysCount || 1) * 450),
          transportationType: r.transportationType || 'سيارة الشركة',
          status: 'معتمد',
          approvedBy: user.name
        });
      });
      setImportNotice(`تم استيراد ${rows.length} أمر مأمورية بنجاح عبر الكاميرا والمسح الضوئي.`);
    }
    setTimeout(() => setImportNotice(null), 5000);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const rows = await parseExcelFile(file);
      if (activeTab === 'permits') {
        let count = 0;
        rows.forEach((r: any) => {
          const empId = String(r['كود الموظف'] || r.employeeId || employees[0]?.employeeId || '1001');
          onAddPermit({
            employeeId: empId,
            permitType: (r['نوع الإذن'] || r.permitType || 'إذن شخصي') as PermitType,
            date: String(r['التاريخ'] || r.date || new Date().toISOString().split('T')[0]),
            startTime: String(r['من الساعة'] || r.startTime || '09:00'),
            endTime: String(r['إلى الساعة'] || r.endTime || '11:00'),
            durationHours: Number(r['المدة (ساعات)'] || r.durationHours || 2),
            reason: String(r['السبب'] || r.reason || 'مستورد من ملف Excel'),
            status: 'معتمد',
            approvedBy: user.name
          });
          count++;
        });
        setImportNotice(`تم استيراد ${count} إذن وتصريح خروج من ملف Excel بنجاح.`);
      } else {
        let count = 0;
        rows.forEach((r: any) => {
          const empId = String(r['كود الموظف'] || r.employeeId || employees[0]?.employeeId || '1001');
          const days = Number(r['عدد الأيام'] || r.daysCount || 1);
          const perDay = Number(r['البدل اليومي'] || r.allowancePerDay || 450);
          onAddMission({
            employeeId: empId,
            missionType: (r['نوع المأمورية'] || r.missionType || 'مأمورية ببدل') as MissionType,
            destination: String(r['الجهة والموقع'] || r.destination || 'موقع السويس'),
            purpose: String(r['الغرض من التكليف'] || r.purpose || 'مستورد من ملف Excel'),
            startDate: String(r['تاريخ البدء'] || r.startDate || new Date().toISOString().split('T')[0]),
            endDate: String(r['تاريخ العودة'] || r.endDate || new Date().toISOString().split('T')[0]),
            daysCount: days,
            allowancePerDay: perDay,
            totalAllowance: Number(r['إجمالي البدل (ج.م)'] || r.totalAllowance || (days * perDay)),
            transportationType: (r['وسيلة الانتقال'] || r.transportationType || 'سيارة الشركة') as any,
            status: 'معتمد',
            approvedBy: user.name
          });
          count++;
        });
        setImportNotice(`تم استيراد ${count} مأمورية رسمية من ملف Excel بنجاح.`);
      }
      setTimeout(() => setImportNotice(null), 5000);
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء قراءة ملف Excel، يرجى التأكد من صحة الملف وصيغته.');
    } finally {
      if (excelFileRef.current) excelFileRef.current.value = '';
    }
  };

  const handleExportExcel = () => {
    if (activeTab === 'permits') {
      exportPermitsToExcel(permits, employees);
    } else {
      exportMissionsToExcel(missions, employees);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Hidden Excel file input */}
      <input
        ref={excelFileRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={handleExcelImport}
      />

      {/* Import feedback notice */}
      {importNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{importNotice}</span>
          </div>
          <button onClick={() => setImportNotice(null)} className="text-emerald-700 hover:text-emerald-900 font-bold">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            إدارة الأذونات والمأموريات الرسمية
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تصاريح الخروج المؤقت (إذن شخصي / إذن عمل) والمأموريات الخارجية (ببدل / بدون بدل / داخلية)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Universal Import by Photo / Camera */}
          <button
            onClick={() => setShowPhotoModal(true)}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="استيراد وتصوير مستند الإذن أو المأمورية بالكاميرا"
          >
            <Camera className="w-4 h-4 text-cyan-400" />
            <span>استيراد وتصوير ({activeTab === 'permits' ? 'إذن' : 'مأمورية'})</span>
          </button>

          {/* Import Excel */}
          <button
            onClick={() => excelFileRef.current?.click()}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="استيراد ملف Excel أو CSV"
          >
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>استيراد Excel</span>
          </button>

          {/* Export Excel */}
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            title="تصدير السجل إلى Excel"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>تصدير Excel</span>
          </button>

          {user.role === 'ADMIN' && (
            <>
              {activeTab === 'permits' ? (
                <button
                  onClick={() => setShowAddPermitModal(true)}
                  className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إصدار تصريح / إذن</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowAddMissionModal(true)}
                  className="px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إصدار أمر مأمورية</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('permits')}
          className={`py-2 px-4 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'permits'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>سجل الأذونات والتصاريح ({permits.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('missions')}
          className={`py-2 px-4 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'missions'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>سجل المأموريات وبدلات السفر ({missions.length})</span>
        </button>
      </div>

      {/* PERMITS TAB */}
      {activeTab === 'permits' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">رقم الإذن</th>
                  <th className="py-3 px-3">كود الموظف</th>
                  <th className="py-3 px-4">اسم الموظف والإدارة</th>
                  <th className="py-3 px-3">نوع الإذن</th>
                  <th className="py-3 px-3 font-mono">التاريخ</th>
                  <th className="py-3 px-3 font-mono">الفترة (من - إلى)</th>
                  <th className="py-3 px-3 font-mono">المدة بالساعات</th>
                  <th className="py-3 px-4">السبب</th>
                  <th className="py-3 px-3">المعتمد</th>
                  <th className="py-3 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {permits.map(p => {
                  const emp = empMap.get(p.employeeId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-700">{p.id}</td>
                      <td className="py-3 px-3 font-mono text-blue-700 font-bold">{p.employeeId}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onSelectEmployee(p.employeeId)}
                          className="font-bold text-slate-900 hover:text-blue-700 cursor-pointer text-right block"
                        >
                          {emp?.name}
                        </button>
                        <span className="text-[10px] text-slate-500 block">{emp?.department}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          p.permitType === 'إذن شخصي' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {p.permitType}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">{p.date}</td>
                      <td className="py-3 px-3 font-mono text-slate-700">{p.startTime} - {p.endTime}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">{p.durationHours} س</td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{p.reason}</td>
                      <td className="py-3 px-3 text-slate-700">{p.approvedBy || 'معتمد'}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[11px]">
                          {p.status}
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

      {/* MISSIONS TAB */}
      {activeTab === 'missions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">رقم التكليف</th>
                  <th className="py-3 px-3">كود</th>
                  <th className="py-3 px-4">اسم الموظف والإدارة</th>
                  <th className="py-3 px-3">نوع المأمورية</th>
                  <th className="py-3 px-4">الجهة والهدف</th>
                  <th className="py-3 px-3">الفترة والمدة</th>
                  <th className="py-3 px-3 font-mono">البدل المالي المستحق</th>
                  <th className="py-3 px-3">وسيلة الانتقال</th>
                  <th className="py-3 px-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {missions.map(m => {
                  const emp = empMap.get(m.employeeId);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-700">{m.id}</td>
                      <td className="py-3 px-3 font-mono text-blue-700 font-bold">{m.employeeId}</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => onSelectEmployee(m.employeeId)}
                          className="font-bold text-slate-900 hover:text-blue-700 cursor-pointer text-right block"
                        >
                          {emp?.name}
                        </button>
                        <span className="text-[10px] text-slate-500 block">{emp?.department}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          m.missionType === 'مأمورية ببدل'
                            ? 'bg-amber-100 text-amber-900'
                            : m.missionType === 'مأمورية داخلية'
                            ? 'bg-slate-100 text-slate-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {m.missionType}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{m.destination}</div>
                        <div className="text-[10px] text-slate-500">{m.purpose}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">
                        <div>{m.startDate} إلى {m.endDate}</div>
                        <span className="font-bold text-slate-900">({m.daysCount} أيام)</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                        {m.totalAllowance ? `${m.totalAllowance} ج.م` : 'بدون بدل مالي'}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{m.transportationType}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[11px]">
                          {m.status}
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

      {/* Add Permit Modal */}
      {showAddPermitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">إصدار تصريح خروج / إذن عمل</h3>
              <button onClick={() => setShowAddPermitModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <form onSubmit={handlePermitSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف *</label>
                <select
                  value={pEmpId}
                  onChange={(e) => setPEmpId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  {employees.map(e => (
                    <option key={e.employeeId} value={e.employeeId}>{e.employeeId} - {e.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">نوع الإذن *</label>
                  <select
                    value={pType}
                    onChange={(e) => setPType(e.target.value as PermitType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="إذن شخصي">إذن شخصي (بحد أقصى ساعتين)</option>
                    <option value="إذن عمل">إذن عمل / خروج لمهمة رسمية</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">التاريخ *</label>
                  <input
                    type="date"
                    value={pDate}
                    onChange={(e) => setPDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">من الساعة</label>
                  <input
                    type="time"
                    value={pStart}
                    onChange={(e) => setPStart(e.target.value)}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">إلى الساعة</label>
                  <input
                    type="time"
                    value={pEnd}
                    onChange={(e) => setPEnd(e.target.value)}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">المدة (ساعات)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="8"
                    value={pDuration}
                    onChange={(e) => setPDuration(Number(e.target.value))}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">السبب أو الجهة المقصودة *</label>
                <input
                  type="text"
                  required
                  value={pReason}
                  onChange={(e) => setPReason(e.target.value)}
                  placeholder="سبب الخروج والمتابعة..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddPermitModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-xs">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-blue-700 text-white rounded-lg text-xs font-bold">اعتماد الإذن</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Mission Modal */}
      {showAddMissionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">إصدار أمر تكليف بمأمورية عمل</h3>
              <button onClick={() => setShowAddMissionModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <form onSubmit={handleMissionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف المكلف بالمأمورية *</label>
                <select
                  value={mEmpId}
                  onChange={(e) => setMEmpId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                >
                  {employees.map(e => (
                    <option key={e.employeeId} value={e.employeeId}>{e.employeeId} - {e.name} ({e.department})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">نوع المأمورية *</label>
                  <select
                    value={mType}
                    onChange={(e) => setMType(e.target.value as MissionType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="مأمورية ببدل">مأمورية ببدل سفر وانتقال</option>
                    <option value="مأمورية داخلية">مأمورية داخلية (نطاق السويس)</option>
                    <option value="مأمورية بدون بدل">مأمورية بدون بدل</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">وسيلة الانتقال</label>
                  <select
                    value={mTransport}
                    onChange={(e) => setMTransport(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="سيارة الشركة">سيارة الشركة</option>
                    <option value="قطار / حافلة">قطار / حافلة</option>
                    <option value="طيران">طيران</option>
                    <option value="خاصة ببدل انتقال">سيارة خاصة ببدل انتقال</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الجهة المقصودة (الموقع / المحافظة) *</label>
                <input
                  type="text"
                  required
                  value={mDestination}
                  onChange={(e) => setMDestination(e.target.value)}
                  placeholder="مثال: الهيئة المصرية العامة للبترول - القاهرة"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الغرض من المأمورية *</label>
                <input
                  type="text"
                  required
                  value={mPurpose}
                  onChange={(e) => setMPurpose(e.target.value)}
                  placeholder="تفاصيل التكليف الرسمي..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ البدء</label>
                  <input
                    type="date"
                    value={mStart}
                    onChange={(e) => setMStart(e.target.value)}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ العودة</label>
                  <input
                    type="date"
                    value={mEnd}
                    onChange={(e) => setMEnd(e.target.value)}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">عدد الأيام</label>
                  <input
                    type="number"
                    min="1"
                    value={mDays}
                    onChange={(e) => setMDays(Number(e.target.value))}
                    className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                    required
                  />
                </div>
              </div>
              {mType === 'مأمورية ببدل' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">قيمة البدل اليومي (ج.م)</label>
                    <input
                      type="number"
                      value={mAllowancePerDay}
                      onChange={(e) => setMAllowancePerDay(Number(e.target.value))}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded font-mono"
                    />
                  </div>
                  <div>
                    <span className="block text-slate-700 font-semibold mb-1">إجمالي البدل المستحق</span>
                    <span className="text-base font-black text-amber-900 font-mono block pt-1">
                      {mDays * mAllowancePerDay} جنيه مصري
                    </span>
                  </div>
                </div>
              )}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddMissionModal(false)} className="px-4 py-2 bg-slate-100 rounded-lg text-xs">إلغاء</button>
                <button type="submit" className="px-5 py-2 bg-amber-700 text-white rounded-lg text-xs font-bold">اعتماد التكليف</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Camera / Photo Import Scanner Modal */}
      {showPhotoModal && (
        <PhotoImportModal
          domain={activeTab === 'permits' ? 'permits' : 'missions'}
          title={activeTab === 'permits' ? 'استيراد وتصوير تصاريح وأذونات الخروج (كاميرا / OCR)' : 'استيراد وتصوير أوامر المأموريات (كاميرا / OCR)'}
          description="التقط صورة مستند الإذن أو أمر التكليف بالمأمورية عبر الكاميرا المباشرة أو ارفع صورة المستند، وسيقوم النظام باستخراج البيانات واعتمادها فوراً."
          onClose={() => setShowPhotoModal(false)}
          onImportData={handlePhotoImport}
        />
      )}

    </div>
  );
};

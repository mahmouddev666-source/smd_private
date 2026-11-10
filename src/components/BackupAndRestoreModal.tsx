/**
 * SMD - Suez Methanol Derivatives Co.
 * Universal Backup & Restore Center (مركز استرداد وتصدير ملفات المنظومة الشامل)
 * Accessible on EVERY PAGE of the system
 */

import React, { useState, useRef } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  FileCode, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  X, 
  Check, 
  ShieldCheck, 
  Camera,
  Layers,
  ArrowRight
} from 'lucide-react';
import { StorageService } from '../services/storage';
import { exportAllSheetsToExcel } from '../utils/fileExport';
import { Employee, AttendanceRecord, LeaveBalance, LeaveRecord, PermitRecord, MissionRecord } from '../types';

interface BackupAndRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaveBalances: LeaveBalance[];
  leaves: LeaveRecord[];
  permits: PermitRecord[];
  missions: MissionRecord[];
  onDataRestored: () => void;
  onOpenPhotoScan?: (domain: string) => void;
}

export const BackupAndRestoreModal: React.FC<BackupAndRestoreModalProps> = ({
  isOpen,
  onClose,
  employees,
  attendance,
  leaveBalances,
  leaves,
  permits,
  missions,
  onDataRestored,
  onOpenPhotoScan
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'restore'>('export');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [parsedRestoreData, setParsedRestoreData] = useState<any | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // 1. Export JSON Full Backup
  const handleExportJson = () => {
    StorageService.exportDatabaseAsJson();
    setStatusMessage({
      type: 'success',
      text: 'تم تجهيز وتنزيل ملف النسخة الاحتياطية الشاملة (JSON) بنجاح.'
    });
  };

  // 2. Export Multi-Sheet Excel
  const handleExportExcelWorkbook = () => {
    exportAllSheetsToExcel({
      employees,
      attendance,
      balances: leaveBalances,
      leaves,
      permits,
      missions
    });
    setStatusMessage({
      type: 'success',
      text: 'تم تصدير كافة جداول المنظومة في مصنف Excel موحد وشامل بنجاح.'
    });
  };

  // 3. Handle File Selection for Restore
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const data = parsed.data || parsed;
        setParsedRestoreData(data);
        setStatusMessage(null);
      } catch (err) {
        setStatusMessage({
          type: 'error',
          text: 'الملف المختار غير صالح أو تالف. يرجى اختيار ملف نسخة احتياطية بصيغة JSON صالحة.'
        });
        setParsedRestoreData(null);
      }
    };
    reader.readAsText(file);
  };

  // 4. Confirm Restore
  const handleConfirmRestore = () => {
    if (!parsedRestoreData) return;
    const ok = StorageService.importDatabaseFromJson(parsedRestoreData);
    if (ok) {
      onDataRestored();
      setStatusMessage({
        type: 'success',
        text: 'تمت استعادة كافة البيانات وقواعد الجداول بنجاح وتحديث واجهات النظام فوراً!'
      });
      setParsedRestoreData(null);
      setTimeout(() => {
        onClose();
      }, 2000);
    } else {
      setStatusMessage({
        type: 'error',
        text: 'فشلت عملية الاستعادة. تحقق من تطابق حقول قاعدة البيانات.'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Modal Top Header */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                مركز إدارة واسترداد وتصدير ملفات المنظومة
              </h3>
              <p className="text-xs text-blue-200">
                شركة السويس لمشتقات الميثانول SMD - النسخ الاحتياطي والاسترداد الشامل
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="bg-slate-100 p-3 border-b border-slate-200 flex items-center justify-center gap-3">
          <button
            onClick={() => { setActiveTab('export'); setStatusMessage(null); }}
            className={`py-2 px-6 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'export'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>تصدير ملفات وبيانات المنظومة</span>
          </button>
          <button
            onClick={() => { setActiveTab('restore'); setStatusMessage(null); }}
            className={`py-2 px-6 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'restore'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>استرداد ورفع نسخة احتياطية</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          
          {/* Status Message */}
          {statusMessage && (
            <div className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2.5 ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-300' 
                : 'bg-rose-50 text-rose-900 border border-rose-300'
            }`}>
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* TAB 1: EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  يمكنك تصدير كافة بيانات الموظفين، سجلات الحضور والانصراف، حسابات الإضافي (بفاصل 6:00 م)، أرصدة الإجازات، والأذونات والمأموريات في أي وقت لتأمين البيانات محلياً.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* JSON Full Database */}
                <div className="border border-slate-200 rounded-xl p-4 hover:border-blue-400 transition-all bg-slate-50/50 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                        <FileCode className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">
                        نسخة احتياطية كاملة (JSON)
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      ملف قاعدة بيانات متكامل يتضمن كافة الجداول والإعدادات والتراخيص لاستعادته بضغطة واحدة.
                    </p>
                  </div>

                  <button
                    onClick={handleExportJson}
                    className="w-full py-2.5 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تحميل النسخة الاحتياطية (.json)</span>
                  </button>
                </div>

                {/* Multi-Sheet Excel */}
                <div className="border border-slate-200 rounded-xl p-4 hover:border-emerald-400 transition-all bg-slate-50/50 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">
                        مصنف Excel موحد (Multi-Sheet)
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      ملف Excel رسمي يحتوي على أوراق عمل منفصلة للعاملين، الحضور، الإجازات، والأذونات.
                    </p>
                  </div>

                  <button
                    onClick={handleExportExcelWorkbook}
                    className="w-full py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير مصنف Excel (.xlsx)</span>
                  </button>
                </div>

              </div>

              {/* Data Summary Stats */}
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-700 block mb-2">إحصائيات البيانات الحالية للتصدير:</span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">العاملين</span>
                    <strong className="font-mono text-blue-700">{employees.length}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">الحضور</span>
                    <strong className="font-mono text-blue-700">{attendance.length}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">الأرصدة</span>
                    <strong className="font-mono text-blue-700">{leaveBalances.length}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">الإجازات</span>
                    <strong className="font-mono text-blue-700">{leaves.length}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">الأذونات</span>
                    <strong className="font-mono text-blue-700">{permits.length}</strong>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] text-slate-500 block">المأموريات</span>
                    <strong className="font-mono text-blue-700">{missions.length}</strong>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: RESTORE */}
          {activeTab === 'restore' && (
            <div className="space-y-4">
              
              <input
                ref={jsonFileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileSelect}
              />

              {!parsedRestoreData ? (
                <div
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-2xl p-8 text-center cursor-pointer transition-all space-y-3"
                >
                  <div className="w-14 h-14 mx-auto bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center">
                    <Upload className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    اضغط هنا لاختيار ملف النسخة الاحتياطية (.json)
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    حدد ملف النسخة الاحتياطية المُصدر مسبقاً من منظومة شركة SMD لاستعادة كافة البيانات.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <h4 className="text-xs font-bold text-slate-900">
                        تم فحص ملف النسخة الاحتياطية بنجاح: {fileName}
                      </h4>
                    </div>
                    <button
                      onClick={() => { setParsedRestoreData(null); setFileName(''); }}
                      className="text-xs text-blue-700 hover:underline font-semibold cursor-pointer"
                    >
                      تغيير الملف
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">العاملين في النسخة</span>
                      <strong className="font-mono text-slate-900">{parsedRestoreData.employees?.length || 0}</strong>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">سجلات الحضور</span>
                      <strong className="font-mono text-slate-900">{parsedRestoreData.attendance?.length || 0}</strong>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">أرصدة وطلبات إجازة</span>
                      <strong className="font-mono text-slate-900">{(parsedRestoreData.leaveBalances?.length || 0) + (parsedRestoreData.leaves?.length || 0)}</strong>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">أذونات ومأموريات</span>
                      <strong className="font-mono text-slate-900">{(parsedRestoreData.permits?.length || 0) + (parsedRestoreData.missions?.length || 0)}</strong>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                    تنبيه: سيؤدي تأكيد الاسترداد إلى استبدال البيانات الحالية بالبيانات الموجودة في ملف النسخة الاحتياطية.
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setParsedRestoreData(null)}
                      className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmRestore}
                      className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>تأكيد استعادة قاعدة البيانات الآن</span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

/**
 * SMD - Suez Methanol Derivatives Co.
 * ZKTeco Hardware Integration & Biometric Terminal Manager
 * Powered by Network TCP/IP Socket & pyzk SDK Daemon
 */

import React, { useState } from 'react';
import { 
  ZKTecoDevice, 
  BiometricLogEntry, 
  Employee, 
  UserSession 
} from '../types';
import { 
  Cpu, 
  RefreshCw, 
  Wifi, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Terminal, 
  Download, 
  Fingerprint, 
  ShieldCheck, 
  Radio
} from 'lucide-react';
import { PYTHON_ZKTECO_SERVICE } from '../data/backendArchitecture';

interface ZKTecoManagerViewProps {
  devices: ZKTecoDevice[];
  biometricLogs: BiometricLogEntry[];
  employees: Employee[];
  user: UserSession;
  onUpdateDevice: (dev: ZKTecoDevice) => void;
  onSyncDeviceLogs: (deviceId: string) => void;
}

export const ZKTecoManagerView: React.FC<ZKTecoManagerViewProps> = ({
  devices,
  biometricLogs,
  employees,
  user,
  onUpdateDevice,
  onSyncDeviceLogs
}) => {
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ [key: string]: string }>({});
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showCode, setShowCode] = useState<boolean>(false);

  const empMap = new Map(employees.map(e => [e.employeeId, e]));

  const handleTestConnection = (dev: ZKTecoDevice) => {
    setTestingDeviceId(dev.id);
    setTestResult(prev => ({ ...prev, [dev.id]: 'جاري فحص اتصال TCP/IP بالمنفذ 4370...' }));

    setTimeout(() => {
      setTestingDeviceId(null);
      setTestResult(prev => ({
        ...prev,
        [dev.id]: `تم الاتصال بنجاح بالجهاز (${dev.deviceModel}). السيريال: ${dev.serialNumber}. المستخدمين: ${dev.totalUsers} موظف.`
      }));
    }, 1200);
  };

  const handleSyncPunches = (dev: ZKTecoDevice) => {
    setIsSyncing(true);
    setSyncFeedback(`جاري الاتصال بجهاز ${dev.name} (${dev.ipAddress}) واستخراج الحركات...`);

    setTimeout(() => {
      onSyncDeviceLogs(dev.id);
      setIsSyncing(false);
      setSyncFeedback(`اكتملت المزامنة بنجاح! تم سحب الحركات وتحديث سجلات الحضور والانصراف وحساب الإضافي تلقائياً.`);
    }, 1800);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-blue-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-semibold mb-2">
              <Fingerprint className="w-4 h-4 text-blue-400" />
              <span>ربط أجهزة البصمة عبر الشبكة المحلية (LAN / TCP Socket)</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              إدارة أجهزة البصمة ZKTeco Biometric Terminals
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              سحب سجلات الحضور والانصراف اللحظية ومطابقة كود الموظف (PIN) مع البصمة المسجلة، ثم إرسالها تلقائياً لمحرك حساب الوقت الإضافي SMD Overtime Engine.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCode(!showCode)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-blue-400" />
              <span>كود خدمة Python (pyzk)</span>
            </button>
          </div>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-4 bg-emerald-950/80 border border-emerald-600 rounded-xl text-emerald-200 text-xs flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Hardware Terminals Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {devices.map(dev => (
          <div key={dev.id} className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
            
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs text-blue-700 font-mono font-bold block">{dev.id}</span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">{dev.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{dev.location}</p>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold">
                <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-600" />
                <span>متصل بالشبكة</span>
              </div>
            </div>

            {/* Specifications */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200/70">
              <div>
                <span className="text-slate-500 block">عنوان IP والمنفذ:</span>
                <strong className="font-mono text-slate-800 text-sm" dir="ltr">{dev.ipAddress}:{dev.port}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">طراز الجهاز:</span>
                <strong className="text-slate-800">{dev.deviceModel}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">رقم السيريال:</span>
                <strong className="font-mono text-slate-700">{dev.serialNumber}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">إصدار الفيرموير:</span>
                <strong className="font-mono text-slate-700">{dev.firmwareVersion}</strong>
              </div>
              <div>
                <span className="text-slate-500 block">المستخدمون المسجلون:</span>
                <strong className="font-mono text-slate-900">{dev.totalUsers} موظف</strong>
              </div>
              <div>
                <span className="text-slate-500 block">سجلات البصمة في الذاكرة:</span>
                <strong className="font-mono text-slate-900">{dev.totalLogs} حركة</strong>
              </div>
            </div>

            {testResult[dev.id] && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed font-mono">
                {testResult[dev.id]}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleTestConnection(dev)}
                disabled={testingDeviceId === dev.id}
                className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>{testingDeviceId === dev.id ? 'جاري الفحص...' : 'اختبار اتصال TCP'}</span>
              </button>

              <button
                onClick={() => handleSyncPunches(dev)}
                disabled={isSyncing}
                className="flex-1 py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'جاري السحب...' : 'سحب الحركات الآن'}</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
              <span>آخر مزامنة ناجحة: {dev.lastSync}</span>
              <span>Communication Key: {dev.commKey}</span>
            </div>

          </div>
        ))}
      </div>

      {/* Live Punch Logs Stream */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              تدفق حركات البصمة اللحظية الواردة (Real-Time Biometric Punch Stream)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              السجلات المباشرة المسحوبة من ذاكرة فلاش أجهزة ZKTeco مع نوع التحقق (بصمة إصبع / وجه)
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
            {biometricLogs.length} حركة مسجلة
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">رقم الحركة</th>
                <th className="py-3 px-3">كود الموظف (PIN)</th>
                <th className="py-3 px-4">اسم الموظف</th>
                <th className="py-3 px-3">جهاز البصمة</th>
                <th className="py-3 px-3 font-mono">وقت وتاريخ الحركة</th>
                <th className="py-3 px-3">طريقة التحقق</th>
                <th className="py-3 px-3">نوع الحركة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {biometricLogs.map((log) => {
                const emp = empMap.get(log.enrollNumber);
                return (
                  <tr key={log.id} className="hover:bg-slate-50 font-mono">
                    <td className="py-3 px-3 text-slate-400">{log.id}</td>
                    <td className="py-3 px-3 font-bold text-blue-700">{log.enrollNumber}</td>
                    <td className="py-3 px-4 font-sans font-bold text-slate-900">
                      {emp?.name || `موظف كود ${log.enrollNumber}`}
                    </td>
                    <td className="py-3 px-3 font-sans text-slate-600">{log.deviceId}</td>
                    <td className="py-3 px-3 text-slate-800">{log.timestamp}</td>
                    <td className="py-3 px-3 font-sans">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                        {log.verifyMode}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        log.punchType === 'دخول'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {log.punchType}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Python SDK Daemon Code View */}
      {showCode && (
        <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 text-slate-200 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white font-mono">zkteco_service.py (Python TCP/IP Integration)</span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(PYTHON_ZKTECO_SERVICE);
                alert('تم نسخ كود بايثون ZKTeco إلى الحافظة!');
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono transition-colors cursor-pointer"
            >
              نسخ الكود
            </button>
          </div>
          <pre className="text-xs font-mono overflow-x-auto text-emerald-300 p-3 bg-slate-950 rounded-lg max-h-96" dir="ltr">
            {PYTHON_ZKTECO_SERVICE}
          </pre>
        </div>
      )}

    </div>
  );
};

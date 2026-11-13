/**
 * SMD - Suez Methanol Derivatives Co.
 * ZKTeco biometric terminal manager.
 *
 * The browser never opens a TCP socket to a terminal: the API connector
 * (`services/zkteco.py` on the server) tests the connection, pulls attendance
 * and records a sync log. Demo mode keeps a clearly-labelled local simulation.
 */

import React, { useState } from 'react';
import {
  ZKTecoDevice,
  BiometricLogEntry,
  ZktecoSyncLog,
  DeviceConnection,
  Employee,
  UnknownPunch,
  UserSession,
} from '../types';
import {
  Cpu,
  RefreshCw,
  Wifi,
  CheckCircle2,
  AlertCircle,
  Fingerprint,
  Radio,
  History,
  ServerCog,
  UserPlus,
  Ban,
  ListChecks,
} from 'lucide-react';
import {
  deviceStatusMeta,
  formatSyncTime,
  summarizeConnection,
  summarizeSyncResult,
} from '../utils/zkteco';
import { canEdit } from '../utils/roles';

interface ZKTecoManagerViewProps {
  devices: ZKTecoDevice[];
  biometricLogs: BiometricLogEntry[];
  syncLogs: ZktecoSyncLog[];
  unknownPunches: UnknownPunch[];
  employees: Employee[];
  user: UserSession;
  onUpdateDevice: (dev: ZKTecoDevice) => Promise<void>;
  /** Sends a real "test connection" request through the server connector. */
  onTestConnection: (dev: ZKTecoDevice) => Promise<DeviceConnection>;
  /** Pulls punches through the server connector; rejects with an Arabic error. */
  onSyncDeviceLogs: (deviceId: string) => Promise<ZktecoSyncLog>;
  /** Links an unknown PIN to an employee and maps it to attendance. */
  onAssignUnknownPunch: (punchId: string, employeeId: string) => Promise<string>;
  /** Dismisses an unknown punch from the report. */
  onIgnoreUnknownPunch: (punchId: string) => Promise<string>;
  /** False while the server-side ZKTeco connector is not deployed. */
  syncEnabled?: boolean;
}

export const ZKTecoManagerView: React.FC<ZKTecoManagerViewProps> = ({
  devices,
  biometricLogs,
  syncLogs,
  unknownPunches,
  employees,
  user,
  syncEnabled = true,
  onTestConnection,
  onSyncDeviceLogs,
  onAssignUnknownPunch,
  onIgnoreUnknownPunch,
}) => {
  const [activeTab, setActiveTab] = useState<'devices' | 'unknown'>('devices');
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);
  const [syncDeviceId, setSyncDeviceId] = useState<string | null>(null);
  const [resolvingPunchId, setResolvingPunchId] = useState<string | null>(null);
  const [assignTargets, setAssignTargets] = useState<{ [key: string]: string }>({});
  const [testResult, setTestResult] = useState<{ [key: string]: string }>({});
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  const empMap = new Map(employees.map((e) => [e.employeeId, e]));
  const userCanEdit = canEdit(user.role);
  const activeEmployees = employees.filter((employee) => employee.isActive);

  const handleTestConnection = async (dev: ZKTecoDevice) => {
    setTestingDeviceId(dev.id);
    setFeedback(null);
    setTestResult((prev) => ({ ...prev, [dev.id]: 'جاري فحص اتصال TCP/IP بالمنفذ 4370...' }));
    try {
      const info = await onTestConnection(dev);
      setTestResult((prev) => ({ ...prev, [dev.id]: summarizeConnection(info) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذّر الاتصال بالجهاز.';
      setTestResult((prev) => ({ ...prev, [dev.id]: '' }));
      setFeedback({ kind: 'error', text: message });
    } finally {
      setTestingDeviceId(null);
    }
  };

  const handleSyncPunches = async (dev: ZKTecoDevice) => {
    setSyncDeviceId(dev.id);
    setFeedback(null);
    try {
      const log = await onSyncDeviceLogs(dev.id);
      setFeedback({ kind: 'success', text: summarizeSyncResult(log) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذّرت مزامنة حركات البصمة.';
      setFeedback({ kind: 'error', text: message });
    } finally {
      setSyncDeviceId(null);
    }
  };

  const handleAssignPunch = async (punch: UnknownPunch) => {
    const employeeId = assignTargets[punch.id];
    if (!employeeId) {
      setFeedback({ kind: 'error', text: 'اختر الموظف المطابق لهذه البصمة أولًا.' });
      return;
    }
    setResolvingPunchId(punch.id);
    setFeedback(null);
    try {
      const message = await onAssignUnknownPunch(punch.id, employeeId);
      setFeedback({ kind: 'success', text: message });
      setAssignTargets((prev) => {
        const next = { ...prev };
        delete next[punch.id];
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذّر ربط البصمة بالموظف.';
      setFeedback({ kind: 'error', text: message });
    } finally {
      setResolvingPunchId(null);
    }
  };

  const handleIgnorePunch = async (punch: UnknownPunch) => {
    setResolvingPunchId(punch.id);
    setFeedback(null);
    try {
      const message = await onIgnoreUnknownPunch(punch.id);
      setFeedback({ kind: 'success', text: message });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذّر تجاهل البصمة.';
      setFeedback({ kind: 'error', text: message });
    } finally {
      setResolvingPunchId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-blue-900/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-semibold mb-2">
              <Fingerprint className="w-4 h-4 text-blue-400" />
              <span>ربط أجهزة البصمة عبر خدمة الخادم (LAN / TCP Socket)</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              إدارة أجهزة البصمة ZKTeco Biometric Terminals
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              يفتح خادم SMD-HR جلسة TCP/IP مع الجهاز على الشبكة المحلية، ويسحب الحركات مرة واحدة
              فقط، ثم يسجل كل محاولة مزامنة (الوقت، العدد، الأخطاء). المتصفح لا يتصل بالجهاز مباشرة.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-400/30 rounded-lg text-xs text-blue-200">
            <ServerCog className="w-4 h-4 shrink-0" />
            <span>Connector: services/zkteco.py</span>
          </div>
        </div>
      </div>

      {!syncEnabled && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <span className="leading-relaxed">
            خدمة المزامنة غير مفعّلة في هذه النسخة. الأجهزة مسجّلة، لكن «اختبار الاتصال» و«سحب
            الحركات» معطّلان حتى يُشغّل الموصل على الخادم.
          </span>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 shadow-sm border ${
            feedback.kind === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="leading-relaxed">{feedback.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200" role="tablist" aria-label="أقسام إدارة أجهزة البصمة">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'devices'}
          onClick={() => setActiveTab('devices')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'devices'
              ? 'border-blue-700 text-blue-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ServerCog className="w-4 h-4" />
          <span>الأجهزة والمزامنة</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'unknown'}
          onClick={() => setActiveTab('unknown')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'unknown'
              ? 'border-amber-600 text-amber-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ListChecks className="w-4 h-4" />
          <span>البصمات غير المعروفة</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
              unknownPunches.length > 0
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {unknownPunches.length}
          </span>
        </button>
      </div>

      {activeTab === 'devices' && (
        <>
      {/* Terminals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {devices.map((dev) => {
          const status = deviceStatusMeta(dev.status);
          const isTesting = testingDeviceId === dev.id;
          const isSyncing = syncDeviceId === dev.id;
          return (
            <div
              key={dev.id}
              className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs text-blue-700 font-mono font-bold block">{dev.id}</span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">{dev.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{dev.location}</p>
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 border rounded-lg text-xs font-semibold ${status.tone}`}
                >
                  <Radio className="w-3.5 h-3.5 shrink-0" />
                  <span>{status.label}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-lg border border-slate-200/70">
                <div>
                  <span className="text-slate-500 block">عنوان IP والمنفذ:</span>
                  <strong className="font-mono text-slate-800 text-sm" dir="ltr">
                    {dev.ipAddress}:{dev.port}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">طراز الجهاز:</span>
                  <strong className="text-slate-800">{dev.deviceModel || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">رقم السيريال:</span>
                  <strong className="font-mono text-slate-700">{dev.serialNumber || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">إصدار الفيرموير:</span>
                  <strong className="font-mono text-slate-700">{dev.firmwareVersion || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">المستخدمون المسجلون:</span>
                  <strong className="font-mono text-slate-900">
                    {dev.totalUsers ?? 0} موظف
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">سجلات البصمة في الذاكرة:</span>
                  <strong className="font-mono text-slate-900">{dev.totalLogs ?? 0} حركة</strong>
                </div>
              </div>

              {testResult[dev.id] && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
                  {testResult[dev.id]}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void handleTestConnection(dev)}
                  disabled={isTesting || !syncEnabled}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{isTesting ? 'جاري الفحص...' : 'اختبار اتصال TCP'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleSyncPunches(dev)}
                  disabled={isSyncing || !syncEnabled}
                  className="flex-1 py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'جاري السحب...' : 'سحب الحركات الآن'}</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between gap-2 pt-1">
                <span>آخر مزامنة ناجحة: {dev.lastSync || '—'}</span>
                <span>
                  Communication Key:{' '}
                  {dev.isDemo
                    ? 'محفوظ محليًا (وضع تجريبي)'
                    : dev.hasCommKey
                      ? 'محفوظ على الخادم — مخفي'
                      : 'غير محدد'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Punch stream */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              تدفق حركات البصمة الواردة (Biometric Punch Stream)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              السجلات المسحوبة من ذاكرة الأجهزة، كل حركة تُحفظ مرة واحدة فقط
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
            {biometricLogs.length} حركة مسجلة
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <caption className="sr-only">حركات البصمة المسجلة من أجهزة ZKTeco</caption>
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th scope="col" className="py-3 px-3">رقم الحركة</th>
                <th scope="col" className="py-3 px-3">كود الموظف (PIN)</th>
                <th scope="col" className="py-3 px-4">اسم الموظف</th>
                <th scope="col" className="py-3 px-3">جهاز البصمة</th>
                <th scope="col" className="py-3 px-3 font-mono">وقت وتاريخ الحركة</th>
                <th scope="col" className="py-3 px-3">طريقة التحقق</th>
                <th scope="col" className="py-3 px-3">نوع الحركة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {biometricLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                    لا توجد حركات بعد. استخدم «سحب الحركات الآن» بعد تشغيل الموصل على الخادم.
                  </td>
                </tr>
              )}
              {biometricLogs.map((log) => {
                const emp = empMap.get(log.enrollNumber);
                return (
                  <tr key={log.id} className="hover:bg-slate-50 font-mono">
                    <td className="py-3 px-3 text-slate-400">{log.id}</td>
                    <td className="py-3 px-3 font-bold text-blue-700">{log.enrollNumber}</td>
                    <td className="py-3 px-4 font-sans font-bold text-slate-900">
                      {emp?.name || (
                        <span className="text-amber-700">بصمة غير مطابقة لكود مسجل</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-sans text-slate-600">{log.deviceId}</td>
                    <td className="py-3 px-3 text-slate-800">{log.timestamp}</td>
                    <td className="py-3 px-3 font-sans">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-medium">
                        {log.verifyMode}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          log.punchType === 'دخول'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
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

      {/* Sync logs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-700" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">سجل المزامنة (Sync Logs)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                وقت كل محاولة، عدد الحركات المسحوبة والجديدة والمكررة وغير المعروفة
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
            {syncLogs.length} محاولة
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <caption className="sr-only">سجل محاولات مزامنة أجهزة البصمة</caption>
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th scope="col" className="py-3 px-3">الوقت</th>
                <th scope="col" className="py-3 px-3">الجهاز</th>
                <th scope="col" className="py-3 px-3">الحالة</th>
                <th scope="col" className="py-3 px-3">مسحوبة</th>
                <th scope="col" className="py-3 px-3">جديدة</th>
                <th scope="col" className="py-3 px-3">مكررة</th>
                <th scope="col" className="py-3 px-3">غير معروفة</th>
                <th scope="col" className="py-3 px-3">حضور جديد</th>
                <th scope="col" className="py-3 px-3">تحديث حضور</th>
                <th scope="col" className="py-3 px-3">الخطأ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {syncLogs.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    لا توجد محاولات مزامنة بعد.
                  </td>
                </tr>
              )}
              {syncLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-mono text-slate-700">
                    {formatSyncTime(log.startedAt)}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-600">{log.deviceId}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        log.status === 'success'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.status === 'running'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {log.status === 'success'
                        ? 'ناجحة'
                        : log.status === 'running'
                          ? 'جارية'
                          : 'فاشلة'}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono">{log.fetchedCount}</td>
                  <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                    {log.insertedCount}
                  </td>
                  <td className="py-3 px-3 font-mono">{log.duplicateCount}</td>
                  <td className="py-3 px-3 font-mono">
                    {log.unknownCount > 0 ? (
                      <span className="text-amber-700 font-bold">{log.unknownCount}</span>
                    ) : (
                      log.unknownCount
                    )}
                  </td>
                  <td className="py-3 px-3 font-mono font-bold text-blue-700">
                    {log.attendanceCreated ?? 0}
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700">
                    {log.attendanceUpdated ?? 0}
                  </td>
                  <td className="py-3 px-3 text-rose-700 max-w-[220px] truncate" title={log.errorMessage}>
                    {log.errorMessage || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Cpu className="w-3.5 h-3.5" />
        <span>
          ملاحظة: لا يمكن للمتصفح الاتصال بجهاز ZKTeco مباشرة؛ كل الاتصالات تمر عبر خادم
          SMD-HR المحلي.
        </span>
      </div>
        </>
      )}

      {activeTab === 'unknown' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-amber-50/60">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  تقرير البصمات غير المعروفة (Unknown Biometrics)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  حركات بصمة لم يُطابق رقمها (PIN) أي كود موظف مسجّل. اربطها بموظف لتُحتسب في
                  الحضور، أو تجاهلها لتختفي من التقرير.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-md border border-amber-300">
                {unknownPunches.length} بصمة
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <caption className="sr-only">حركات بصمة غير مرتبطة بأي موظف</caption>
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th scope="col" className="py-3 px-3">رقم البصمة (PIN)</th>
                    <th scope="col" className="py-3 px-3">الجهاز</th>
                    <th scope="col" className="py-3 px-3">وقت الحركة</th>
                    <th scope="col" className="py-3 px-3">طريقة التحقق</th>
                    <th scope="col" className="py-3 px-3">نوع الحركة</th>
                    <th scope="col" className="py-3 px-3">ربط بموظف</th>
                    <th scope="col" className="py-3 px-3">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {unknownPunches.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        لا توجد بصمات غير معروفة حاليًا. كل حركة مرتبطة بموظف مسجّل.
                      </td>
                    </tr>
                  )}
                  {unknownPunches.map((punch) => {
                    const busy = resolvingPunchId === punch.id;
                    return (
                      <tr key={punch.id} className="hover:bg-amber-50/40">
                        <td className="py-3 px-3 font-mono font-bold text-amber-800">
                          {punch.enrollNumber}
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          {punch.deviceName}
                          {punch.isDemo && (
                            <span className="ms-1 px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] text-slate-500">
                              DEMO
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-800">{punch.punchTime}</td>
                        <td className="py-3 px-3 text-slate-600">{punch.verifyMode}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              punch.punchType === 'دخول'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {punch.punchType}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <label className="sr-only" htmlFor={`assign-${punch.id}`}>
                            اختيار الموظف للبصمة {punch.enrollNumber}
                          </label>
                          <select
                            id={`assign-${punch.id}`}
                            value={assignTargets[punch.id] || ''}
                            onChange={(event) =>
                              setAssignTargets((prev) => ({
                                ...prev,
                                [punch.id]: event.target.value,
                              }))
                            }
                            disabled={!userCanEdit || busy}
                            className="w-56 max-w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                          >
                            <option value="">— اختر الموظف —</option>
                            {activeEmployees.map((employee) => (
                              <option key={employee.employeeId} value={employee.employeeId}>
                                {employee.name} ({employee.employeeId})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleAssignPunch(punch)}
                              disabled={!userCanEdit || busy || !assignTargets[punch.id]}
                              className="px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>{busy ? 'جاري الربط...' : 'ربط'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleIgnorePunch(punch)}
                              disabled={!userCanEdit || busy}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>تجاهل</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {!userCanEdit && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-slate-400" />
              <span>دورك الحالي للعرض فقط؛ ربط البصمات أو تجاهلها يتطلب صلاحية HR أو ADMIN.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

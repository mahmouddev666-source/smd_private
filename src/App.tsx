/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SMD - Suez Methanol Derivatives Co. (شركة السويس لمشتقات الميثانول)
 * Local Web-Based HR & Attendance Management System
 *
 * PHASE-3 NOTE
 * ------------
 * Business data now lives in PostgreSQL and is read/written through
 * `services/apiClient.ts`. The browser only keeps the access token and the UI
 * session. When the API cannot be reached and `VITE_ALLOW_OFFLINE_DEMO` is on
 * (development / preview builds only), the app falls back to the local demo
 * dataset and says so in a visible banner.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Employee,
  AttendanceRecord,
  LeaveRecord,
  LeaveBalance,
  PermitRecord,
  MissionRecord,
  ZKTecoDevice,
  BiometricLogEntry,
  LicenseConfig,
  UserSession,
  UserRole,
} from './types';
import * as api from './services/apiClient';
import { StorageService } from './services/storage';
import { DEMO_ACCOUNTS, Login } from './components/Login';
import { Navbar, ActiveTab } from './components/Navbar';
import { LockScreen } from './components/LockScreen';
import { Dashboard } from './components/Dashboard';
import { EmployeeDirectory } from './components/EmployeeDirectory';
import { EmployeeProfileModal } from './components/EmployeeProfileModal';
import { AttendanceManager } from './components/AttendanceManager';
import { OvertimeCalculatorWidget } from './components/OvertimeCalculatorWidget';
import { LeaveAndBalances } from './components/LeaveAndBalances';
import { PermitsAndMissions } from './components/PermitsAndMissions';
import { ZKTecoManagerView } from './components/ZKTecoManagerView';
import { DepartmentReports } from './components/DepartmentReports';
import { FormsManager } from './components/FormsManager';
import { ArchitectureAndDbView } from './components/ArchitectureAndDbView';
import { LicensingManager } from './components/LicensingManager';
import { BackupAndRestoreModal } from './components/BackupAndRestoreModal';
import { calculateOvertime } from './utils/overtimeCalculator';
import { localDateISO, localTimeString } from './utils/dateUtils';
import { newId } from './utils/id';
import { AlertCircle, CheckCircle2, Database, Loader2, RefreshCw, WifiOff } from 'lucide-react';

type DataMode = 'api' | 'demo';

interface Banner {
  kind: 'error' | 'success';
  text: string;
}

/** True when the failure means "the server is not reachable" (not a 4xx). */
function isServerUnavailable(error: unknown): boolean {
  return error instanceof api.NetworkError || (error instanceof api.ApiError && error.status >= 500);
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function demoSessionFor(username: string, password: string): UserSession | null {
  const account = DEMO_ACCOUNTS.find(
    (item) => item.username === username.trim().toLowerCase() && item.password === password,
  );
  return account
    ? { id: account.id, name: account.name, email: account.email, role: account.role }
    : null;
}

export default function App() {
  // Session & data source
  const [mode, setMode] = useState<DataMode>('api');
  const [user, setUser] = useState<UserSession | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Core data
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [missions, setMissions] = useState<MissionRecord[]>([]);
  const [devices, setDevices] = useState<ZKTecoDevice[]>([]);
  const [biometricLogs, setBiometricLogs] = useState<BiometricLogEntry[]>([]);
  const [license, setLicense] = useState<LicenseConfig>(() => StorageService.getLicense());

  // Modals & navigation helpers
  const [selectedProfileEmpId, setSelectedProfileEmpId] = useState<string | null>(null);
  const [smartFormEmpId, setSmartFormEmpId] = useState<string | undefined>(undefined);
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);

  const employeesRef = useRef<Employee[]>([]);
  employeesRef.current = employees;

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadDemoSnapshot = useCallback(() => {
    StorageService.ensureDataVersion();
    setEmployees(StorageService.getEmployees());
    setAttendance(StorageService.getAttendance());
    setLeaveBalances(StorageService.getLeaveBalances());
    setLeaves(StorageService.getLeaves());
    setPermits(StorageService.getPermits());
    setMissions(StorageService.getMissions());
    setDevices(StorageService.getDevices());
    setBiometricLogs(StorageService.getBiometricLogs());
    setLicense(StorageService.getLicense());
  }, []);

  const loadApiSnapshot = useCallback(async () => {
    const snapshot = await api.fetchAll();
    setEmployees(snapshot.employees);
    setAttendance(snapshot.attendance);
    setLeaveBalances(snapshot.leaveBalances);
    setLeaves(snapshot.leaves);
    setPermits(snapshot.permits);
    setMissions(snapshot.missions);
    setDevices(snapshot.devices);
    setBiometricLogs([]);
  }, []);

  const refreshSnapshot = useCallback(async () => {
    setSyncing(true);
    setBanner(null);
    try {
      if (mode === 'demo') loadDemoSnapshot();
      else await loadApiSnapshot();
      return true;
    } catch (error) {
      setBanner({ kind: 'error', text: messageOf(error, 'تعذر تحميل البيانات من الخادم.') });
      return false;
    } finally {
      setSyncing(false);
    }
  }, [mode, loadApiSnapshot, loadDemoSnapshot]);

  const refreshEmployees = useCallback(async () => {
    const rows = await api.fetchEmployees();
    setEmployees(rows);
    setAttendance(await api.fetchAttendance(rows));
  }, []);

  const refreshAttendance = useCallback(async () => {
    setAttendance(await api.fetchAttendance(employeesRef.current));
  }, []);

  const refreshLeaves = useCallback(async () => {
    const [rows, balances] = await Promise.all([api.fetchLeaves(), api.fetchLeaveBalances()]);
    setLeaves(rows);
    setLeaveBalances(balances);
  }, []);

  // ---------------------------------------------------------------------------
  // Session bootstrap
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = api.getStoredSession();
      if (!api.getToken() || !stored) {
        setBootstrapping(false);
        return;
      }

      try {
        const me = await api.fetchMe();
        if (cancelled) return;
        setUser(me);
        setMode('api');
        await loadApiSnapshot();
      } catch (error) {
        if (cancelled) return;
        if (isServerUnavailable(error) && api.ALLOW_OFFLINE_DEMO) {
          setMode('demo');
          setUser(stored);
          loadDemoSnapshot();
          setBanner({
            kind: 'error',
            text: 'تعذّر الاتصال بالخادم — تم فتح وضع العرض المحلي التجريبي. لن تُحفظ أي تعديلات في قاعدة البيانات.',
          });
        } else {
          // Invalid/expired token: show the login screen again.
          api.logout();
          setUser(null);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadApiSnapshot, loadDemoSnapshot]);

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  const handleLogin = async (username: string, password: string) => {
    try {
      const session = await api.login(username, password);
      setMode('api');
      setUser(session);
      setBanner(null);
      setBootstrapping(true);
      try {
        await loadApiSnapshot();
      } finally {
        setBootstrapping(false);
      }
      return;
    } catch (error) {
      if (!api.ALLOW_OFFLINE_DEMO || !isServerUnavailable(error)) {
        throw error;
      }
      // Development / offline preview fallback.
      const session = demoSessionFor(username, password);
      if (!session) {
        // Do not leak server status in the credentials error; the offline
        // banner appears once a valid demo account is used.
        throw new Error(
          'اسم المستخدم أو كلمة المرور غير صحيحة. (تعذّر الاتصال بالخادم — وضع العرض المحلي التجريبي)',
        );
      }
      api.logout();
      setMode('demo');
      setUser(session);
      loadDemoSnapshot();
      setBanner({
        kind: 'error',
        text: 'وضع العرض المحلي التجريبي: الخادم غير متصل، والبيانات من المتصفح ولن تُحفظ في قاعدة البيانات.',
      });
    }
  };

  const handleLogout = () => {
    api.logout();
    StorageService.setCurrentUser(null);
    setUser(null);
    setBanner(null);
    setActiveTab('dashboard');
    setEmployees([]);
    setAttendance([]);
    setLeaveBalances([]);
    setLeaves([]);
    setPermits([]);
    setMissions([]);
    setDevices([]);
    setBiometricLogs([]);
  };

  // ---------------------------------------------------------------------------
  // License & time-lock (placeholder, demo mode only)
  // ---------------------------------------------------------------------------

  const lockStatus = StorageService.isSystemLocked();

  const handleUnlockSystem = (newExpiryDate: string, newKey: string) => {
    const updated: LicenseConfig = {
      ...license,
      expiryDate: newExpiryDate,
      licenseKey: newKey,
      isTimeLocked: false,
      lastVerifiedAt: localDateISO(),
    };
    setLicense(updated);
    StorageService.saveLicense(updated);
  };

  const handleManualLock = () => {
    const updated: LicenseConfig = { ...license, isTimeLocked: true };
    setLicense(updated);
    StorageService.saveLicense(updated);
  };

  const handleUpdateLicense = (newLic: LicenseConfig) => {
    setLicense(newLic);
    StorageService.saveLicense(newLic);
  };

  const handleSwitchRole = (newRole: UserRole) => {
    if (!user || mode !== 'demo') return;
    const roleNames: Record<UserRole, string> = {
      ADMIN: 'أ. محمد عبد الرحمن (مدير النظام)',
      HR: 'أ. منى إبراهيم عطية (موارد بشرية)',
      VIEWER: 'أحمد السعيد (قراءة فقط)',
    };
    setUser({ ...user, role: newRole, name: roleNames[newRole] });
  };

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------

  const handleAddEmployee = async (emp: Omit<Employee, 'serial'>) => {
    if (mode === 'demo') {
      StorageService.addEmployee(emp);
      loadDemoSnapshot();
      return;
    }
    await api.createEmployee(emp);
    await Promise.all([refreshEmployees(), refreshLeaves()]);
  };

  const handleUpdateEmployee = async (emp: Employee) => {
    if (mode === 'demo') {
      StorageService.updateEmployee(emp);
      loadDemoSnapshot();
      return;
    }
    await api.updateEmployee(emp.employeeId, emp);
    await refreshEmployees();
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (mode === 'demo') {
      StorageService.deleteEmployee(employeeId);
      loadDemoSnapshot();
      return;
    }
    await api.deactivateEmployee(employeeId);
    await refreshEmployees();
  };

  // ---------------------------------------------------------------------------
  // Attendance
  // ---------------------------------------------------------------------------

  const handleAddAttendance = async (record: Omit<AttendanceRecord, 'id'>) => {
    if (mode === 'demo') {
      StorageService.addAttendanceRecord(record);
      loadDemoSnapshot();
      return;
    }
    await api.upsertAttendance(record);
    await refreshAttendance();
  };

  // ---------------------------------------------------------------------------
  // Leaves
  // ---------------------------------------------------------------------------

  const handleAddLeave = async (leave: Omit<LeaveRecord, 'id'>) => {
    if (mode === 'demo') {
      StorageService.addLeave(leave);
      loadDemoSnapshot();
      return;
    }
    // The API creates leaves as "قيد المراجعة"; approve immediately because the
    // UI form is the HR approval action and the balance must be deducted once.
    const created = await api.createLeave(leave);
    try {
      await api.decideLeave(created.id, 'معتمد');
    } finally {
      await refreshLeaves();
    }
  };

  // ---------------------------------------------------------------------------
  // Permits & missions
  // ---------------------------------------------------------------------------

  const handleAddPermit = async (permit: Omit<PermitRecord, 'id'>) => {
    if (mode === 'demo') {
      StorageService.addPermit(permit);
      loadDemoSnapshot();
      return;
    }
    await api.createPermit(permit);
    setPermits(await api.fetchPermits());
  };

  const handleAddMission = async (mission: Omit<MissionRecord, 'id'>) => {
    if (mode === 'demo') {
      StorageService.addMission(mission);
      loadDemoSnapshot();
      return;
    }
    await api.createMission(mission);
    setMissions(await api.fetchMissions());
  };

  // ---------------------------------------------------------------------------
  // ZKTeco devices
  // ---------------------------------------------------------------------------

  const handleUpdateDevice = async (device: ZKTecoDevice) => {
    if (mode === 'demo') {
      StorageService.updateDevice(device);
      loadDemoSnapshot();
      return;
    }
    await api.updateDevice(device);
    setDevices(await api.fetchDevices());
  };

  /** DEMO_MODE only: the real connector runs on the server (phase 5). */
  const handleSyncDeviceLogs = (deviceId: string) => {
    if (mode !== 'demo') return;

    const dateStr = localDateISO();
    const timeStr = localTimeString().slice(0, 5);

    const activeEmployees = employees.filter((employee) => employee.isActive);
    if (activeEmployees.length === 0) return;

    const sampleEmp1 = activeEmployees[0];
    const sampleEmp2 = activeEmployees[1] || activeEmployees[0];

    const newLogs: BiometricLogEntry[] = [
      {
        id: newId('PUNCH'),
        deviceId,
        enrollNumber: sampleEmp1.employeeId,
        timestamp: `${dateStr} 07:55:00`,
        verifyMode: 'بصمة إصبع',
        punchType: 'دخول',
        isDemo: true,
      },
      {
        id: newId('PUNCH'),
        deviceId,
        enrollNumber: sampleEmp1.employeeId,
        timestamp: `${dateStr} 20:00:00`,
        verifyMode: 'بصمة إصبع',
        punchType: 'خروج',
        isDemo: true,
      },
      {
        id: newId('PUNCH'),
        deviceId,
        enrollNumber: sampleEmp2.employeeId,
        timestamp: `${dateStr} 07:45:00`,
        verifyMode: 'بصمة وجه',
        punchType: 'دخول',
        isDemo: true,
      },
      {
        id: newId('PUNCH'),
        deviceId,
        enrollNumber: sampleEmp2.employeeId,
        timestamp: `${dateStr} 21:30:00`,
        verifyMode: 'بصمة وجه',
        punchType: 'خروج',
        isDemo: true,
      },
    ];

    const updatedLogs = [...newLogs, ...StorageService.getBiometricLogs()];
    StorageService.saveBiometricLogs(updatedLogs);
    setBiometricLogs(updatedLogs);

    const ot1 = calculateOvertime('NORMAL_DAY', '07:55', '20:00', sampleEmp1.hourlyRate);
    StorageService.addAttendanceRecord({
      employeeId: sampleEmp1.employeeId,
      date: dateStr,
      shiftType: 'NORMAL_DAY',
      checkIn: '07:55',
      checkOut: '20:00',
      workingHours: ot1.actualWorkedHours,
      standardHours: ot1.standardHours,
      overtimeHoursTotal: ot1.totalOvertimeHours,
      dayOvertimeHours: ot1.dayOvertimeHours,
      nightOvertimeHours: ot1.nightOvertimeHours,
      dayOvertimePay: ot1.dayOvertimePay,
      nightOvertimePay: ot1.nightOvertimePay,
      totalOvertimePay: ot1.totalOvertimePay,
      source: 'ZKTeco-Biometric',
      deviceId,
      status: ot1.suggestedStatus,
      notes: 'مزامنة تجريبية (DEMO_MODE) — لا يوجد اتصال فعلي بالجهاز',
      isDemo: sampleEmp1.isDemo,
    });

    const device = devices.find((item) => item.id === deviceId);
    if (device) {
      StorageService.updateDevice({
        ...device,
        lastSync: `${dateStr} ${timeStr}:00`,
        totalLogs: (device.totalLogs || 0) + 4,
      });
    }
    loadDemoSnapshot();
  };

  // Open Smart Form helper from Profile Modal
  const handleOpenSmartForm = (type: 'leave' | 'permit' | 'mission', empId: string) => {
    setSelectedProfileEmpId(null);
    setSmartFormEmpId(empId);
    setActiveTab('forms');
  };

  const handleDataRestored = () => {
    if (mode === 'demo') loadDemoSnapshot();
    else void refreshSnapshot();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (bootstrapping) {
    return (
      <div
        className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-white"
        dir="rtl"
      >
        <img
          src="/logo.png"
          alt="شعار شركة السويس لمشتقات الميثانول - SMD HR"
          className="w-24 h-24 object-contain bg-white rounded-2xl p-2 shadow-xl"
          referrerPolicy="no-referrer"
        />
        <div className="flex items-center gap-2 text-sm font-bold">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>جارٍ تحميل بيانات المنظومة...</span>
        </div>
        <p className="text-xs text-slate-400">SMD-HR · الخادم المحلي</p>
      </div>
    );
  }

  // Time-lock is a demo-only placeholder until the licensing API exists.
  if (mode === 'demo' && !user && lockStatus.isLocked) {
    return (
      <LockScreen reason={lockStatus.reason} license={license} onUnlock={handleUnlockSystem} />
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} showDemoAccounts={api.ALLOW_OFFLINE_DEMO} />;
  }

  const selectedEmployee = employees.find((employee) => employee.employeeId === selectedProfileEmpId);
  const selectedEmployeeBalance = leaveBalances.find(
    (balance) => balance.employeeId === selectedProfileEmpId,
  );

  return (
    <div
      className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white"
      dir="rtl"
    >
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={handleLogout}
        onLockNow={handleManualLock}
        isTimeLocked={license.isTimeLocked}
        onOpenBackupModal={() => setShowBackupModal(true)}
        showBackupButton={mode === 'demo'}
        showLicensingButton={mode === 'demo'}
      />

      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 space-y-3">
        {mode === 'demo' && (
          <div
            role="status"
            className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold flex items-start gap-2"
          >
            <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              وضع العرض المحلي التجريبي (DEMO_MODE): البيانات تُقرأ من المتصفح ولا تُحفظ في
              PostgreSQL. شغّل <code className="font-mono">docker compose up</code> للعمل على
              الخادم الحقيقي.
            </span>
          </div>
        )}

        {banner && (
          <div
            role="alert"
            className={`p-3 rounded-xl border text-xs font-semibold flex items-start justify-between gap-3 ${
              banner.kind === 'error'
                ? 'border-rose-300 bg-rose-50 text-rose-800'
                : 'border-emerald-300 bg-emerald-50 text-emerald-800'
            }`}
          >
            <div className="flex items-start gap-2">
              {banner.kind === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              onClick={() => setBanner(null)}
              className="font-bold opacity-70 hover:opacity-100"
              aria-label="إغلاق التنبيه"
            >
              ✕
            </button>
          </div>
        )}

        {syncing && (
          <div className="flex items-center gap-2 text-[11px] font-bold text-blue-800">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>جارٍ تحديث البيانات من الخادم...</span>
          </div>
        )}
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            employees={employees}
            attendance={attendance}
            leaveBalances={leaveBalances}
            devices={devices}
            user={user}
            onSelectEmployee={(empId) => setSelectedProfileEmpId(empId)}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'employees' && (
          <EmployeeDirectory
            employees={employees}
            user={user}
            onAddEmployee={handleAddEmployee}
            onUpdateEmployee={handleUpdateEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            onSelectEmployee={(empId) => setSelectedProfileEmpId(empId)}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceManager
            attendance={attendance}
            employees={employees}
            user={user}
            onAddAttendance={handleAddAttendance}
            onSelectEmployee={(empId) => setSelectedProfileEmpId(empId)}
          />
        )}

        {activeTab === 'overtime' && <OvertimeCalculatorWidget />}

        {activeTab === 'leaves' && (
          <LeaveAndBalances
            leaves={leaves}
            balances={leaveBalances}
            employees={employees}
            user={user}
            onAddLeave={handleAddLeave}
            onSelectEmployee={(empId) => setSelectedProfileEmpId(empId)}
          />
        )}

        {activeTab === 'permits' && (
          <PermitsAndMissions
            permits={permits}
            missions={missions}
            employees={employees}
            user={user}
            onAddPermit={handleAddPermit}
            onAddMission={handleAddMission}
            onSelectEmployee={(empId) => setSelectedProfileEmpId(empId)}
          />
        )}

        {activeTab === 'zkteco' && (
          <ZKTecoManagerView
            devices={devices}
            biometricLogs={biometricLogs}
            employees={employees}
            user={user}
            syncEnabled={mode === 'demo'}
            onUpdateDevice={handleUpdateDevice}
            onSyncDeviceLogs={handleSyncDeviceLogs}
          />
        )}

        {activeTab === 'reports' && (
          <DepartmentReports
            employees={employees}
            attendance={attendance}
            leaves={leaves}
            missions={missions}
          />
        )}

        {activeTab === 'forms' && (
          <FormsManager
            user={user}
            apiEnabled={mode === 'api'}
            demoEnabled={api.ALLOW_OFFLINE_DEMO}
            employees={employees}
            leaves={leaves}
            permits={permits}
            missions={missions}
          />
        )}

        {activeTab === 'architecture' && <ArchitectureAndDbView />}

        {activeTab === 'licensing' && mode === 'demo' && (
          <LicensingManager
            license={license}
            user={user}
            onUpdateLicense={handleUpdateLicense}
            onSwitchRole={handleSwitchRole}
            onTriggerLock={handleManualLock}
          />
        )}
      </main>

      {/* Complete Employee Profile Dossier Modal */}
      {selectedEmployee && (
        <EmployeeProfileModal
          employee={selectedEmployee}
          balance={selectedEmployeeBalance}
          attendance={attendance}
          leaves={leaves}
          permits={permits}
          missions={missions}
          onClose={() => setSelectedProfileEmpId(null)}
          onOpenSmartForm={handleOpenSmartForm}
        />
      )}

      {/* Local backup/restore stays available only in demo mode. */}
      {mode === 'demo' && (
        <>
          <BackupAndRestoreModal
            isOpen={showBackupModal}
            onClose={() => setShowBackupModal(false)}
            employees={employees}
            attendance={attendance}
            leaveBalances={leaveBalances}
            leaves={leaves}
            permits={permits}
            missions={missions}
            onDataRestored={handleDataRestored}
          />

          <div className="fixed bottom-4 left-4 z-40 no-print flex items-center gap-2">
            <button
              onClick={() => setShowBackupModal(true)}
              className="px-3.5 py-2.5 bg-gradient-to-r from-blue-900 to-slate-900 hover:from-blue-800 hover:to-slate-800 text-white rounded-xl text-xs font-bold shadow-xl border border-blue-400/30 flex items-center gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95"
              title="استرداد وتصدير ملفات وبيانات المنظومة — وضع العرض المحلي فقط"
            >
              <Database className="w-4 h-4 text-cyan-300" />
              <span className="hidden sm:inline">مركز استرداد وتصدير الملفات</span>
              <span className="sm:hidden">استرداد وتصدير</span>
            </button>
          </div>
        </>
      )}

      {/* Quiet Corporate Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 no-print">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">شركة السويس لمشتقات الميثانول (SMD)</span>
            <span>·</span>
            <span>الإدارة العامة للموارد البشرية</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <button
              onClick={() => void refreshSnapshot()}
              className="flex items-center gap-1 hover:text-blue-700"
              title="تحديث البيانات من الخادم"
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
            <span>·</span>
            <span>{mode === 'api' ? 'متصل بالخادم' : 'وضع تجريبي محلي'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

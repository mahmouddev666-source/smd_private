/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * SMD - Suez Methanol Derivatives Co. (شركة السويس لمشتقات الميثانول)
 * Local Web-Based HR & Attendance Management System
 */

import React, { useState, useEffect } from 'react';
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
  UserRole 
} from './types';
import { StorageService } from './services/storage';
import { Login } from './components/Login';
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
import { SmartForms } from './components/SmartForms';
import { ArchitectureAndDbView } from './components/ArchitectureAndDbView';
import { LicensingManager } from './components/LicensingManager';
import { BackupAndRestoreModal } from './components/BackupAndRestoreModal';
import { calculateOvertime } from './utils/overtimeCalculator';
import { localDateISO, localTimeString } from './utils/dateUtils';
import { newId } from './utils/id';
import { Database } from 'lucide-react';

// Align the local dataset with the current demo schema before any component
// reads from storage (e.g. legacy `1001+` datasets are reseeded once).
StorageService.ensureDataVersion();

export default function App() {
  // Session
  const [user, setUser] = useState<UserSession | null>(() => StorageService.getCurrentUser());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Core Data
  const [employees, setEmployees] = useState<Employee[]>(() => StorageService.getEmployees());
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => StorageService.getAttendance());
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>(() => StorageService.getLeaveBalances());
  const [leaves, setLeaves] = useState<LeaveRecord[]>(() => StorageService.getLeaves());
  const [permits, setPermits] = useState<PermitRecord[]>(() => StorageService.getPermits());
  const [missions, setMissions] = useState<MissionRecord[]>(() => StorageService.getMissions());
  const [devices, setDevices] = useState<ZKTecoDevice[]>(() => StorageService.getDevices());
  const [biometricLogs, setBiometricLogs] = useState<BiometricLogEntry[]>(() => StorageService.getBiometricLogs());
  const [license, setLicense] = useState<LicenseConfig>(() => StorageService.getLicense());

  // Modals & Navigation Helpers
  const [selectedProfileEmpId, setSelectedProfileEmpId] = useState<string | null>(null);
  const [smartFormEmpId, setSmartFormEmpId] = useState<string | undefined>(undefined);
  const [showBackupModal, setShowBackupModal] = useState<boolean>(false);

  const handleDataRestored = () => {
    setEmployees(StorageService.getEmployees());
    setAttendance(StorageService.getAttendance());
    setLeaveBalances(StorageService.getLeaveBalances());
    setLeaves(StorageService.getLeaves());
    setPermits(StorageService.getPermits());
    setMissions(StorageService.getMissions());
    setDevices(StorageService.getDevices());
    setBiometricLogs(StorageService.getBiometricLogs());
    setLicense(StorageService.getLicense());
  };

  // Time-Lock Expiry Check
  const lockStatus = StorageService.isSystemLocked();

  // Authentication Handlers
  const handleLogin = (session: UserSession) => {
    setUser(session);
    StorageService.setCurrentUser(session);
  };

  const handleLogout = () => {
    setUser(null);
    StorageService.setCurrentUser(null);
  };

  // License & Time-Lock Handlers
  const handleUnlockSystem = (newExpiryDate: string, newKey: string) => {
    const updated: LicenseConfig = {
      ...license,
      expiryDate: newExpiryDate,
      licenseKey: newKey,
      isTimeLocked: false,
      lastVerifiedAt: localDateISO()
    };
    setLicense(updated);
    StorageService.saveLicense(updated);
  };

  const handleManualLock = () => {
    const updated: LicenseConfig = {
      ...license,
      isTimeLocked: true
    };
    setLicense(updated);
    StorageService.saveLicense(updated);
  };

  const handleUpdateLicense = (newLic: LicenseConfig) => {
    setLicense(newLic);
    StorageService.saveLicense(newLic);
  };

  const handleSwitchRole = (newRole: UserRole) => {
    if (!user) return;
    const roleNames: Record<UserRole, string> = {
      ADMIN: 'أ. محمد عبد الرحمن (مدير النظام)',
      HR: 'أ. منى إبراهيم عطية (موارد بشرية)',
      VIEWER: 'أحمد السعيد (قراءة فقط)'
    };
    const updated: UserSession = {
      ...user,
      role: newRole,
      name: roleNames[newRole]
    };
    setUser(updated);
    StorageService.setCurrentUser(updated);
  };

  // Employee CRUD
  const handleAddEmployee = (emp: Omit<Employee, 'serial'>) => {
    const created = StorageService.addEmployee(emp);
    setEmployees(StorageService.getEmployees());
    setLeaveBalances(StorageService.getLeaveBalances());
  };

  const handleUpdateEmployee = (emp: Employee) => {
    StorageService.updateEmployee(emp);
    setEmployees(StorageService.getEmployees());
  };

  const handleDeleteEmployee = (empId: string) => {
    StorageService.deleteEmployee(empId);
    setEmployees(StorageService.getEmployees());
  };

  // Attendance
  const handleAddAttendance = (rec: Omit<AttendanceRecord, 'id'>) => {
    StorageService.addAttendanceRecord(rec);
    setAttendance(StorageService.getAttendance());
  };

  // Leaves
  const handleAddLeave = (leave: Omit<LeaveRecord, 'id'>) => {
    StorageService.addLeave(leave);
    setLeaves(StorageService.getLeaves());
    setLeaveBalances(StorageService.getLeaveBalances());
  };

  // Permits & Missions
  const handleAddPermit = (permit: Omit<PermitRecord, 'id'>) => {
    StorageService.addPermit(permit);
    setPermits(StorageService.getPermits());
  };

  const handleAddMission = (mission: Omit<MissionRecord, 'id'>) => {
    StorageService.addMission(mission);
    setMissions(StorageService.getMissions());
  };

  // Devices & Biometric Sync
  const handleUpdateDevice = (dev: ZKTecoDevice) => {
    StorageService.updateDevice(dev);
    setDevices(StorageService.getDevices());
  };

  const handleSyncDeviceLogs = (deviceId: string) => {
    const dateStr = localDateISO();
    const timeStr = localTimeString().slice(0, 5);

    const activeEmployees = employees.filter((employee) => employee.isActive);
    if (activeEmployees.length === 0) return;

    const sampleEmp1 = activeEmployees[0];
    const sampleEmp2 = activeEmployees[1] || activeEmployees[0];

    // DEMO_MODE: simulated device pull. The real ZKTeco connector (phase 5)
    // will run on the server via pyzk; the browser never talks to the device.
    const newLogs: BiometricLogEntry[] = [
      {
        id: newId('PUNCH'),
        deviceId,
        enrollNumber: sampleEmp1.employeeId,
        timestamp: `${dateStr} 07:55:00`,
        verifyMode: 'بصمة إصبع',
        punchType: 'دخول',
        isDemo: true
      },
      {
        id: newId('PUNCH'),
        deviceId,
        enrollNumber: sampleEmp1.employeeId,
        timestamp: `${dateStr} 20:00:00`,
        verifyMode: 'بصمة إصبع',
        punchType: 'خروج',
        isDemo: true
      },
      {
        id: newId('PUNCH'),
        deviceId,
        enrollNumber: sampleEmp2.employeeId,
        timestamp: `${dateStr} 07:45:00`,
        verifyMode: 'بصمة وجه',
        punchType: 'دخول',
        isDemo: true
      },
      {
        id: newId('PUNCH'),
        deviceId,
        enrollNumber: sampleEmp2.employeeId,
        timestamp: `${dateStr} 21:30:00`,
        verifyMode: 'بصمة وجه',
        punchType: 'خروج',
        isDemo: true
      }
    ];

    const currentLogs = StorageService.getBiometricLogs();
    const updatedLogs = [...newLogs, ...currentLogs];
    StorageService.saveBiometricLogs(updatedLogs);
    setBiometricLogs(updatedLogs);

    // Upsert today's attendance (one row per employee per day).
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
      isDemo: sampleEmp1.isDemo
    });

    setAttendance(StorageService.getAttendance());

    // Update device lastSync
    const dev = devices.find(d => d.id === deviceId);
    if (dev) {
      handleUpdateDevice({
        ...dev,
        lastSync: `${dateStr} ${timeStr}:00`,
        totalLogs: (dev.totalLogs || 0) + 4
      });
    }
  };

  // Open Smart Form helper from Profile Modal
  const handleOpenSmartForm = (type: 'leave' | 'permit' | 'mission', empId: string) => {
    setSelectedProfileEmpId(null);
    setSmartFormEmpId(empId);
    setActiveTab('forms');
  };

  // If System is Locked / Expired -> Render LockScreen
  if (lockStatus.isLocked) {
    return (
      <LockScreen
        reason={lockStatus.reason}
        license={license}
        onUnlock={handleUnlockSystem}
      />
    );
  }

  // If Not Logged In -> Render Login
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const selectedEmployee = employees.find(e => e.employeeId === selectedProfileEmpId);
  const selectedEmployeeBalance = leaveBalances.find(b => b.employeeId === selectedProfileEmpId);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white" dir="rtl">
      
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={handleLogout}
        onLockNow={handleManualLock}
        isTimeLocked={license.isTimeLocked}
        onOpenBackupModal={() => setShowBackupModal(true)}
      />

      {/* Main Container Viewport */}
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

        {activeTab === 'overtime' && (
          <OvertimeCalculatorWidget />
        )}

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
          <SmartForms
            employees={employees}
            leaveBalances={leaveBalances}
            initialEmployeeId={smartFormEmpId}
          />
        )}

        {activeTab === 'architecture' && (
          <ArchitectureAndDbView />
        )}

        {activeTab === 'licensing' && (
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

      {/* Universal Database Backup & Restore Center Modal */}
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

      {/* Universal Persistent Bottom-Corner Backup & Restore Quick Toolbar (Present on every page) */}
      <div className="fixed bottom-4 left-4 z-40 no-print flex items-center gap-2">
        <button
          onClick={() => setShowBackupModal(true)}
          className="px-3.5 py-2.5 bg-gradient-to-r from-blue-900 to-slate-900 hover:from-blue-800 hover:to-slate-800 text-white rounded-xl text-xs font-bold shadow-xl border border-blue-400/30 flex items-center gap-2 cursor-pointer transition-transform hover:scale-105 active:scale-95"
          title="استرداد وتصدير ملفات وبيانات المنظومة - متاح في كافة الصفحات"
        >
          <Database className="w-4 h-4 text-cyan-300" />
          <span className="hidden sm:inline">مركز استرداد وتصدير الملفات</span>
          <span className="sm:hidden">استرداد وتصدير</span>
        </button>
      </div>

      {/* Quiet Corporate Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 no-print">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">شركة السويس لمشتقات الميثانول (SMD)</span>
            <span>·</span>
            <span>الإدارة العامة للموارد البشرية</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
            <span>إصدار الخادم المحلي: v2.6.4</span>
            <span>·</span>
            <span>منفذ الخدمة: 3000 / 8000</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

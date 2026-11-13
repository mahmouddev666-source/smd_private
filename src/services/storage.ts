/**
 * SMD - Suez Methanol Derivatives Co.
 * Local persistence service.
 *
 * PHASE-1 NOTE
 * ------------
 * This module is a *temporary* browser persistence layer until the FastAPI +
 * PostgreSQL backend (phase 2) replaces it. It already enforces the same
 * business invariants the database will enforce:
 *   - `employees.employee_id` is unique
 *   - `employees.national_id` is unique
 *   - `attendance (employee_id, date)` is unique (upsert, never duplicate)
 *   - every generated identifier is a real UUID-based id, not `length + 1`
 *
 * Demo data is tagged with `isDemo = true` and can be removed independently
 * via `resetDemoData()` without touching real records.
 */

import {
  Employee,
  LeaveBalance,
  LeaveRecord,
  PermitRecord,
  MissionRecord,
  AttendanceRecord,
  ZKTecoDevice,
  BiometricLogEntry,
  LicenseConfig,
  UserSession,
} from '../types';
import {
  INITIAL_EMPLOYEES,
  INITIAL_LEAVE_BALANCES,
  INITIAL_LEAVES,
  INITIAL_PERMITS,
  INITIAL_MISSIONS,
  generateInitialAttendance,
  INITIAL_DEVICES,
  INITIAL_LICENSE,
} from '../data/initialData';
import { attendanceKey, newId } from '../utils/id';
import { localDateISO, localTimestamp } from '../utils/dateUtils';

const KEYS = {
  EMPLOYEES: 'smd_hr_employees',
  LEAVE_BALANCES: 'smd_hr_leave_balances',
  LEAVES: 'smd_hr_leaves',
  PERMITS: 'smd_hr_permits',
  MISSIONS: 'smd_hr_missions',
  ATTENDANCE: 'smd_hr_attendance',
  DEVICES: 'smd_hr_devices',
  BIOMETRIC_LOGS: 'smd_hr_biometric_logs',
  LICENSE: 'smd_hr_license',
  USER_SESSION: 'smd_hr_user_session',
  CUSTOM_FORMS: 'smd_hr_custom_forms',
  DATA_VERSION: 'smd_hr_data_version',
} as const;

/**
 * Bumping this value invalidates older local datasets (e.g. the old `1001+`
 * demo codes). `ensureDataVersion()` then reseeds demo data once.
 */
const CURRENT_DATA_VERSION = '3';
const DEMO_EMPLOYEE_THRESHOLD = 9000;

function cloneFallback<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function safeGet<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    // Always return a copy of the fallback: returning `INITIAL_*` by reference
    // lets callers mutate the module-level seed array.
    if (!val) return cloneFallback(fallback);
    return JSON.parse(val) as T;
  } catch (err) {
    console.error(`Error loading key ${key}:`, err);
    return cloneFallback(fallback);
  }
}

function safeSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving key ${key}:`, err);
  }
}

function isDemoEmployee(employee: Employee): boolean {
  return employee.isDemo === true || Number(employee.employeeId) >= DEMO_EMPLOYEE_THRESHOLD;
}

function createDefaultBalance(employee: Employee): LeaveBalance {
  const currentYear = Number(localDateISO().slice(0, 4));
  return {
    employeeId: employee.employeeId,
    year: currentYear,
    annualOpening: employee.grade.includes('مدير') ? 30 : 21,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: currentYear,
    annualUsed: 0,
    casualUsed: 0,
    sickUsed: 0,
    otherUsed: 0,
    isDemo: employee.isDemo,
  };
}

export const StorageService = {
  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------
  getCurrentUser(): UserSession | null {
    // No auto-login: an explicit session must exist in storage.
    return safeGet<UserSession | null>(KEYS.USER_SESSION, null);
  },
  setCurrentUser(user: UserSession | null): void {
    if (user) {
      safeSet(KEYS.USER_SESSION, user);
    } else {
      localStorage.removeItem(KEYS.USER_SESSION);
    }
  },

  /**
   * Migrates/aligns the local dataset with the current demo schema.
   * Safe to call on every boot: it only writes when a migration is required.
   */
  ensureDataVersion(): void {
    // Read through `safeGet`: values are stored JSON-encoded, so a raw
    // `getItem` would return `"2"` (with quotes) and never match.
    const stored = safeGet<string | null>(KEYS.DATA_VERSION, null);
    if (stored === CURRENT_DATA_VERSION) return;

    const employees = safeGet<Employee[] | null>(KEYS.EMPLOYEES, null);
    const hasLegacyDemoCodes =
      employees !== null &&
      employees.some((employee) => Number(employee.employeeId) < DEMO_EMPLOYEE_THRESHOLD);

    // First run, or an old `1001+` demo dataset: drop stale business data so it
    // is reseeded from `initialData`. Session and license are preserved.
    if (employees === null || hasLegacyDemoCodes) {
      Object.values(KEYS).forEach((key) => {
        if (key === KEYS.LICENSE || key === KEYS.USER_SESSION) return;
        localStorage.removeItem(key);
      });
    }

    safeSet(KEYS.DATA_VERSION, CURRENT_DATA_VERSION);
  },

  // ---------------------------------------------------------------------------
  // Employees
  // ---------------------------------------------------------------------------
  getEmployees(): Employee[] {
    return safeGet<Employee[]>(KEYS.EMPLOYEES, INITIAL_EMPLOYEES);
  },
  saveEmployees(employees: Employee[]): void {
    safeSet(KEYS.EMPLOYEES, employees);
  },
  findEmployee(employeeId: string): Employee | undefined {
    return this.getEmployees().find((employee) => employee.employeeId === employeeId);
  },
  addEmployee(emp: Omit<Employee, 'serial'>): Employee {
    const list = this.getEmployees();
    const employeeId = emp.employeeId.trim();
    const nationalId = emp.nationalId.trim();

    if (!employeeId) {
      throw new Error('كود الموظف مطلوب.');
    }
    if (list.some((employee) => employee.employeeId === employeeId)) {
      throw new Error(`كود الموظف "${employeeId}" مستخدم بالفعل.`);
    }
    if (nationalId && list.some((employee) => employee.nationalId === nationalId)) {
      throw new Error('الرقم القومي مسجل بالفعل لموظف آخر.');
    }

    const maxSerial = list.reduce((max, employee) => Math.max(max, employee.serial), 0);
    const newEmployee: Employee = {
      ...emp,
      employeeId,
      nationalId,
      serial: maxSerial + 1,
    };
    list.push(newEmployee);
    this.saveEmployees(list);

    const balances = this.getLeaveBalances();
    if (!balances.some((balance) => balance.employeeId === newEmployee.employeeId)) {
      balances.push(createDefaultBalance(newEmployee));
      this.saveLeaveBalances(balances);
    }

    return newEmployee;
  },
  updateEmployee(updated: Employee): void {
    const list = this.getEmployees();
    const index = list.findIndex((employee) => employee.employeeId === updated.employeeId);
    if (index === -1) {
      throw new Error('لم يتم العثور على الموظف المطلوب تحديثه.');
    }
    const duplicateNationalId = list.some(
      (employee, employeeIndex) =>
        employeeIndex !== index && employee.nationalId === updated.nationalId,
    );
    if (duplicateNationalId) {
      throw new Error('الرقم القومي مسجل بالفعل لموظف آخر.');
    }
    list[index] = updated;
    this.saveEmployees(list);
  },
  deleteEmployee(employeeId: string): void {
    this.saveEmployees(this.getEmployees().filter((employee) => employee.employeeId !== employeeId));
    // Cascade: remove the employee's balance and daily attendance.
    this.saveLeaveBalances(
      this.getLeaveBalances().filter((balance) => balance.employeeId !== employeeId),
    );
    this.saveAttendance(
      this.getAttendance().filter((record) => record.employeeId !== employeeId),
    );
  },

  // ---------------------------------------------------------------------------
  // Leave balances
  // ---------------------------------------------------------------------------
  getLeaveBalances(): LeaveBalance[] {
    return safeGet<LeaveBalance[]>(KEYS.LEAVE_BALANCES, INITIAL_LEAVE_BALANCES);
  },
  saveLeaveBalances(balances: LeaveBalance[]): void {
    safeSet(KEYS.LEAVE_BALANCES, balances);
  },

  // ---------------------------------------------------------------------------
  // Leaves
  // ---------------------------------------------------------------------------
  getLeaves(): LeaveRecord[] {
    return safeGet<LeaveRecord[]>(KEYS.LEAVES, INITIAL_LEAVES);
  },
  saveLeaves(leaves: LeaveRecord[]): void {
    safeSet(KEYS.LEAVES, leaves);
  },
  addLeave(leave: Omit<LeaveRecord, 'id'>): LeaveRecord {
    const list = this.getLeaves();
    const newRecord: LeaveRecord = { ...leave, id: newId('LV') };
    list.unshift(newRecord);
    this.saveLeaves(list);

    // Deduct from the balance once, only when the leave is approved on creation.
    if (newRecord.status === 'معتمد') {
      this.updateBalanceForLeave(newRecord);
    }
    return newRecord;
  },
  updateBalanceForLeave(leave: LeaveRecord): void {
    const balances = this.getLeaveBalances();
    const balance = balances.find((item) => item.employeeId === leave.employeeId);
    if (!balance) return;

    if (leave.leaveType === 'اعتيادي') {
      balance.annualUsed += leave.daysCount;
    } else if (leave.leaveType === 'عارضة') {
      balance.casualUsed += leave.daysCount;
    } else if (leave.leaveType === 'مرضي') {
      balance.sickUsed += leave.daysCount;
    } else {
      balance.otherUsed += leave.daysCount;
    }
    this.saveLeaveBalances(balances);
  },

  // ---------------------------------------------------------------------------
  // Permits
  // ---------------------------------------------------------------------------
  getPermits(): PermitRecord[] {
    return safeGet<PermitRecord[]>(KEYS.PERMITS, INITIAL_PERMITS);
  },
  savePermits(permits: PermitRecord[]): void {
    safeSet(KEYS.PERMITS, permits);
  },
  addPermit(permit: Omit<PermitRecord, 'id'>): PermitRecord {
    const list = this.getPermits();
    const newRecord: PermitRecord = { ...permit, id: newId('PR') };
    list.unshift(newRecord);
    this.savePermits(list);
    return newRecord;
  },

  // ---------------------------------------------------------------------------
  // Missions
  // ---------------------------------------------------------------------------
  getMissions(): MissionRecord[] {
    return safeGet<MissionRecord[]>(KEYS.MISSIONS, INITIAL_MISSIONS);
  },
  saveMissions(missions: MissionRecord[]): void {
    safeSet(KEYS.MISSIONS, missions);
  },
  addMission(mission: Omit<MissionRecord, 'id'>): MissionRecord {
    const list = this.getMissions();
    const newRecord: MissionRecord = { ...mission, id: newId('MS') };
    list.unshift(newRecord);
    this.saveMissions(list);
    return newRecord;
  },

  // ---------------------------------------------------------------------------
  // Attendance
  // ---------------------------------------------------------------------------
  getAttendance(): AttendanceRecord[] {
    return safeGet<AttendanceRecord[]>(KEYS.ATTENDANCE, generateInitialAttendance());
  },
  saveAttendance(records: AttendanceRecord[]): void {
    safeSet(KEYS.ATTENDANCE, records);
  },
  /**
   * Upserts a daily attendance record. One row per employee per calendar day:
   * syncing a device or re-submitting the form updates the existing row instead
   * of appending a duplicate that inflates payroll.
   */
  addAttendanceRecord(record: Omit<AttendanceRecord, 'id'>): AttendanceRecord {
    const list = this.getAttendance();
    const key = attendanceKey(record.employeeId, record.date);
    const existingIndex = list.findIndex(
      (item) => attendanceKey(item.employeeId, item.date) === key,
    );

    if (existingIndex >= 0) {
      const merged: AttendanceRecord = {
        ...list[existingIndex],
        ...record,
        id: list[existingIndex].id,
      };
      list[existingIndex] = merged;
      this.saveAttendance(list);
      return merged;
    }

    const newRecord: AttendanceRecord = { ...record, id: newId('ATT') };
    list.unshift(newRecord);
    this.saveAttendance(list);
    return newRecord;
  },

  // ---------------------------------------------------------------------------
  // ZKTeco devices (simulated in phase 1, real connector in phase 5)
  // ---------------------------------------------------------------------------
  getDevices(): ZKTecoDevice[] {
    return safeGet<ZKTecoDevice[]>(KEYS.DEVICES, INITIAL_DEVICES);
  },
  saveDevices(devices: ZKTecoDevice[]): void {
    safeSet(KEYS.DEVICES, devices);
  },
  updateDevice(updated: ZKTecoDevice): void {
    this.saveDevices(
      this.getDevices().map((device) => (device.id === updated.id ? updated : device)),
    );
  },

  // ---------------------------------------------------------------------------
  // Biometric logs (clearly marked as simulated demo data)
  // ---------------------------------------------------------------------------
  getBiometricLogs(): BiometricLogEntry[] {
    const today = localDateISO();
    return safeGet<BiometricLogEntry[]>(KEYS.BIOMETRIC_LOGS, [
      {
        id: 'LOG-DEMO-01',
        deviceId: 'ZK-01',
        enrollNumber: '9001',
        timestamp: `${today} 07:55:12`,
        verifyMode: 'بصمة إصبع',
        punchType: 'دخول',
        isDemo: true,
      },
      {
        id: 'LOG-DEMO-02',
        deviceId: 'ZK-01',
        enrollNumber: '9001',
        timestamp: `${today} 20:00:44`,
        verifyMode: 'بصمة إصبع',
        punchType: 'خروج',
        isDemo: true,
      },
      {
        id: 'LOG-DEMO-03',
        deviceId: 'ZK-02',
        enrollNumber: '9002',
        timestamp: `${today} 08:02:10`,
        verifyMode: 'بصمة وجه',
        punchType: 'دخول',
        isDemo: true,
      },
      {
        id: 'LOG-DEMO-04',
        deviceId: 'ZK-02',
        enrollNumber: '9002',
        timestamp: `${today} 16:05:30`,
        verifyMode: 'بصمة وجه',
        punchType: 'خروج',
        isDemo: true,
      },
      {
        // Deliberately unknown PIN: exercises the "بصمات غير معروفة" report in
        // demo mode. HR can assign it to an employee or ignore it.
        id: 'LOG-DEMO-UNKNOWN-01',
        deviceId: 'ZK-01',
        enrollNumber: '7777',
        timestamp: `${today} 09:12:40`,
        verifyMode: 'بصمة إصبع',
        punchType: 'دخول',
        isDemo: true,
      },
    ]);
  },
  saveBiometricLogs(logs: BiometricLogEntry[]): void {
    safeSet(KEYS.BIOMETRIC_LOGS, logs);
  },

  // ---------------------------------------------------------------------------
  // Company form templates (phase 4 will move these to server storage)
  // ---------------------------------------------------------------------------
  getCustomForms(): any[] {
    // `any` is intentional: legacy form templates are free-form JSON blobs until
    // the phase-4 typed document model lands.
    return safeGet<any[]>(KEYS.CUSTOM_FORMS, []);
  },
  saveCustomForms(forms: any[]): void {
    safeSet(KEYS.CUSTOM_FORMS, forms);
  },
  addCustomForm(form: any): void {
    const list = this.getCustomForms();
    list.unshift(form);
    this.saveCustomForms(list);
  },

  // ---------------------------------------------------------------------------
  // Backup & restore
  // ---------------------------------------------------------------------------
  exportDatabaseAsJson(): void {
    const backup = {
      version: '1.1.0',
      company: 'Suez Methanol Derivatives Co. (SMD)',
      exportedAt: localTimestamp(),
      data: {
        employees: this.getEmployees(),
        leaveBalances: this.getLeaveBalances(),
        leaves: this.getLeaves(),
        permits: this.getPermits(),
        missions: this.getMissions(),
        attendance: this.getAttendance(),
        devices: this.getDevices(),
        biometricLogs: this.getBiometricLogs(),
        customForms: this.getCustomForms(),
        license: this.getLicense(),
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `نسخة_احتياطية_شاملة_SMD_${localDateISO()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  },

  importDatabaseFromJson(jsonData: any): boolean {
    try {
      if (!jsonData || typeof jsonData !== 'object') return false;
      const data = jsonData.data || jsonData;

      if (Array.isArray(data.employees)) this.saveEmployees(data.employees);
      if (Array.isArray(data.leaveBalances)) this.saveLeaveBalances(data.leaveBalances);
      if (Array.isArray(data.leaves)) this.saveLeaves(data.leaves);
      if (Array.isArray(data.permits)) this.savePermits(data.permits);
      if (Array.isArray(data.missions)) this.saveMissions(data.missions);
      if (Array.isArray(data.attendance)) this.saveAttendance(data.attendance);
      if (Array.isArray(data.devices)) this.saveDevices(data.devices);
      if (Array.isArray(data.biometricLogs)) this.saveBiometricLogs(data.biometricLogs);
      if (Array.isArray(data.customForms)) this.saveCustomForms(data.customForms);
      if (data.license) this.saveLicense(data.license);

      return true;
    } catch (error) {
      console.error('Failed to import database JSON:', error);
      return false;
    }
  },

  // ---------------------------------------------------------------------------
  // License & time lock (UI-level only in phase 1; enforced on the server later)
  // ---------------------------------------------------------------------------
  getLicense(): LicenseConfig {
    return safeGet<LicenseConfig>(KEYS.LICENSE, INITIAL_LICENSE);
  },
  saveLicense(license: LicenseConfig): void {
    safeSet(KEYS.LICENSE, license);
  },

  isSystemLocked(): { isLocked: boolean; reason?: string } {
    const license = this.getLicense();
    if (license.isTimeLocked) {
      return { isLocked: true, reason: 'تم إيقاف تشغيل النظام يدوياً من لوحة الترخيص.' };
    }
    const today = localDateISO();
    if (license.expiryDate && today > license.expiryDate) {
      return {
        isLocked: true,
        reason: `انتهت صلاحية ترخيص البرنامج في تاريخ ${license.expiryDate}. يرجى تجديد الترخيص مع إدارة نظم المعلومات بشركة السويس لمشتقات الميثانول.`,
      };
    }
    return { isLocked: false };
  },

  // ---------------------------------------------------------------------------
  // Reset helpers
  // ---------------------------------------------------------------------------
  /** Removes only records flagged as demo (`isDemo` or employee code >= 9000). */
  resetDemoData(): void {
    const demoEmployeeIds = new Set(
      this.getEmployees()
        .filter((employee) => isDemoEmployee(employee))
        .map((employee) => employee.employeeId),
    );

    this.saveEmployees(
      this.getEmployees().filter((employee) => !isDemoEmployee(employee)),
    );
    this.saveLeaveBalances(
      this.getLeaveBalances().filter(
        (balance) => !demoEmployeeIds.has(balance.employeeId) && balance.isDemo !== true,
      ),
    );
    this.saveLeaves(this.getLeaves().filter((leave) => leave.isDemo !== true));
    this.savePermits(this.getPermits().filter((permit) => permit.isDemo !== true));
    this.saveMissions(this.getMissions().filter((mission) => mission.isDemo !== true));
    this.saveAttendance(
      this.getAttendance().filter(
        (record) => !demoEmployeeIds.has(record.employeeId) && record.isDemo !== true,
      ),
    );
    this.saveBiometricLogs(
      this.getBiometricLogs().filter((log) => log.isDemo !== true),
    );
    this.saveDevices(this.getDevices().filter((device) => device.isDemo !== true));
  },

  /** Restores the full demo dataset (used by support and UAT). */
  resetAllData(): void {
    Object.values(KEYS).forEach((key) => {
      if (key === KEYS.USER_SESSION) return;
      localStorage.removeItem(key);
    });
    safeSet(KEYS.DATA_VERSION, CURRENT_DATA_VERSION);
  },
};

/**
 * SMD - Suez Methanol Derivatives Co.
 * Local Storage & Persistence Service
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
  ShiftType
} from '../types';
import {
  INITIAL_EMPLOYEES,
  INITIAL_LEAVE_BALANCES,
  INITIAL_LEAVES,
  INITIAL_PERMITS,
  INITIAL_MISSIONS,
  generateInitialAttendance,
  INITIAL_DEVICES,
  INITIAL_LICENSE
} from '../data/initialData';
import { calculateOvertime } from '../utils/overtimeCalculator';

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
  CUSTOM_FORMS: 'smd_hr_custom_forms'
};

function safeGet<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    if (!val) return fallback;
    return JSON.parse(val) as T;
  } catch (err) {
    console.error(`Error loading key ${key}:`, err);
    return fallback;
  }
}

function safeSet<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error(`Error saving key ${key}:`, err);
  }
}

export const StorageService = {
  // Session
  getCurrentUser(): UserSession | null {
    // No auto-login: an explicit session must exist in storage.
    return safeGet<UserSession | null>(KEYS.USER_SESSION, null);
  },
  setCurrentUser(user: UserSession | null): void {
    safeSet(KEYS.USER_SESSION, user);
  },

  // Employees
  getEmployees(): Employee[] {
    return safeGet<Employee[]>(KEYS.EMPLOYEES, INITIAL_EMPLOYEES);
  },
  saveEmployees(employees: Employee[]): void {
    safeSet(KEYS.EMPLOYEES, employees);
  },
  addEmployee(emp: Omit<Employee, 'serial'>): Employee {
    const list = this.getEmployees();
    const maxSerial = list.reduce((m, e) => Math.max(m, e.serial), 0);
    const newEmp: Employee = {
      ...emp,
      serial: maxSerial + 1
    };
    list.push(newEmp);
    this.saveEmployees(list);

    // Also initialize leave balance
    const balances = this.getLeaveBalances();
    if (!balances.find(b => b.employeeId === newEmp.employeeId)) {
      balances.push({
        employeeId: newEmp.employeeId,
        year: new Date().getFullYear(),
        annualOpening: newEmp.grade.includes('مدير') ? 30 : 21,
        casualOpening: 7,
        sickOpening: 90,
        sickCycleStartYear: new Date().getFullYear(),
        annualUsed: 0,
        casualUsed: 0,
        sickUsed: 0,
        otherUsed: 0
      });
      this.saveLeaveBalances(balances);
    }

    return newEmp;
  },
  updateEmployee(updated: Employee): void {
    const list = this.getEmployees().map(e => (e.employeeId === updated.employeeId ? updated : e));
    this.saveEmployees(list);
  },
  deleteEmployee(employeeId: string): void {
    const list = this.getEmployees().filter(e => e.employeeId !== employeeId);
    this.saveEmployees(list);
  },

  // Leave Balances
  getLeaveBalances(): LeaveBalance[] {
    return safeGet<LeaveBalance[]>(KEYS.LEAVE_BALANCES, INITIAL_LEAVE_BALANCES);
  },
  saveLeaveBalances(balances: LeaveBalance[]): void {
    safeSet(KEYS.LEAVE_BALANCES, balances);
  },

  // Leaves
  getLeaves(): LeaveRecord[] {
    return safeGet<LeaveRecord[]>(KEYS.LEAVES, INITIAL_LEAVES);
  },
  saveLeaves(leaves: LeaveRecord[]): void {
    safeSet(KEYS.LEAVES, leaves);
  },
  addLeave(leave: Omit<LeaveRecord, 'id'>): LeaveRecord {
    const list = this.getLeaves();
    const newId = `LV-${new Date().getFullYear()}-${String(list.length + 1).padStart(3, '0')}`;
    const newRecord: LeaveRecord = { ...leave, id: newId };
    list.unshift(newRecord);
    this.saveLeaves(list);

    // Deduct from balance if approved
    if (newRecord.status === 'معتمد') {
      this.updateBalanceForLeave(newRecord);
    }
    return newRecord;
  },
  updateBalanceForLeave(leave: LeaveRecord): void {
    const balances = this.getLeaveBalances();
    const bal = balances.find(b => b.employeeId === leave.employeeId);
    if (!bal) return;

    if (leave.leaveType === 'اعتيادي') {
      bal.annualUsed += leave.daysCount;
    } else if (leave.leaveType === 'عارضة') {
      bal.casualUsed += leave.daysCount;
    } else if (leave.leaveType === 'مرضي') {
      bal.sickUsed += leave.daysCount;
    } else {
      bal.otherUsed += leave.daysCount;
    }
    this.saveLeaveBalances(balances);
  },

  // Permits
  getPermits(): PermitRecord[] {
    return safeGet<PermitRecord[]>(KEYS.PERMITS, INITIAL_PERMITS);
  },
  savePermits(permits: PermitRecord[]): void {
    safeSet(KEYS.PERMITS, permits);
  },
  addPermit(permit: Omit<PermitRecord, 'id'>): PermitRecord {
    const list = this.getPermits();
    const newId = `PR-${new Date().getFullYear()}-${String(list.length + 101).padStart(3, '0')}`;
    const newRec: PermitRecord = { ...permit, id: newId };
    list.unshift(newRec);
    this.savePermits(list);
    return newRec;
  },

  // Missions
  getMissions(): MissionRecord[] {
    return safeGet<MissionRecord[]>(KEYS.MISSIONS, INITIAL_MISSIONS);
  },
  saveMissions(missions: MissionRecord[]): void {
    safeSet(KEYS.MISSIONS, missions);
  },
  addMission(mission: Omit<MissionRecord, 'id'>): MissionRecord {
    const list = this.getMissions();
    const newId = `MS-${new Date().getFullYear()}-${String(list.length + 51).padStart(3, '0')}`;
    const newRec: MissionRecord = { ...mission, id: newId };
    list.unshift(newRec);
    this.saveMissions(list);
    return newRec;
  },

  // Attendance
  getAttendance(): AttendanceRecord[] {
    return safeGet<AttendanceRecord[]>(KEYS.ATTENDANCE, generateInitialAttendance());
  },
  saveAttendance(records: AttendanceRecord[]): void {
    safeSet(KEYS.ATTENDANCE, records);
  },
  addAttendanceRecord(record: Omit<AttendanceRecord, 'id'>): AttendanceRecord {
    const list = this.getAttendance();
    const newId = `ATT-${new Date().getFullYear()}-${String(list.length + 1).padStart(3, '0')}`;
    const newRec: AttendanceRecord = { ...record, id: newId };
    list.unshift(newRec);
    this.saveAttendance(list);
    return newRec;
  },

  // ZKTeco Devices
  getDevices(): ZKTecoDevice[] {
    return safeGet<ZKTecoDevice[]>(KEYS.DEVICES, INITIAL_DEVICES);
  },
  saveDevices(devices: ZKTecoDevice[]): void {
    safeSet(KEYS.DEVICES, devices);
  },
  updateDevice(updated: ZKTecoDevice): void {
    const list = this.getDevices().map(d => (d.id === updated.id ? updated : d));
    this.saveDevices(list);
  },

  // Biometric Logs
  getBiometricLogs(): BiometricLogEntry[] {
    return safeGet<BiometricLogEntry[]>(KEYS.BIOMETRIC_LOGS, [
      {
        id: "LOG-01",
        deviceId: "ZK-01",
        enrollNumber: "1001",
        timestamp: "2026-11-01 07:55:12",
        verifyMode: "بصمة إصبع",
        punchType: "دخول"
      },
      {
        id: "LOG-02",
        deviceId: "ZK-01",
        enrollNumber: "1001",
        timestamp: "2026-11-01 20:00:44",
        verifyMode: "بصمة إصبع",
        punchType: "خروج"
      },
      {
        id: "LOG-03",
        deviceId: "ZK-01",
        enrollNumber: "1002",
        timestamp: "2026-11-01 08:02:10",
        verifyMode: "بصمة وجه",
        punchType: "دخول"
      },
      {
        id: "LOG-04",
        deviceId: "ZK-01",
        enrollNumber: "1002",
        timestamp: "2026-11-01 16:05:30",
        verifyMode: "بصمة وجه",
        punchType: "خروج"
      }
    ]);
  },
  saveBiometricLogs(logs: BiometricLogEntry[]): void {
    safeSet(KEYS.BIOMETRIC_LOGS, logs);
  },

  // Custom Company Form Templates (Imported via camera or created)
  getCustomForms(): any[] {
    return safeGet<any[]>(KEYS.CUSTOM_FORMS, [
      {
        formId: 'SMD-FORM-SAFETY-01',
        formTitle: 'إقرار استلام مهمات الوقاية الشخصية والسلامة (PPE)',
        formCode: 'SMD-HSE-04',
        category: 'السلامة والصحة المهنية',
        sourceType: 'scanned',
        sourceFileName: 'smd_safety_ppe_form.jpg',
        uploadedAt: '2026-11-01',
        description: 'نموذج صرف خوذة وأحذية سلامة ونظارات واقية وقناع غاز للمهندسين والفنيين بموقع مصنع السويس لمشتقات الميثانول',
        headerPreamble: 'بناءً على تعليمات إدارة السلامة والصحة المهنية وحماية البيئة بمصنع السويس لمشتقات الميثانول، أقر أنا الموظف الموضح بياناته أدناه باستلام مهمات الوقاية الموضحة بحالة سليمة والتعهد بارتدائها بصفة مستمرة أثناء التواجد في وحدات التشغيل والإنتاج.',
        fields: [
          { id: 'f1', label: 'المهمات المسلمة', value: 'خوذة أمان بيضاء، حذاء سيفتي كود S3، نظارة واقية ضد الرذاذ الكيميائي، سدادات أذن، قناع واقي من الأبخرة' },
          { id: 'f2', label: 'تاريخ الصرف والاستلام', value: new Date().toISOString().split('T')[0] },
          { id: 'f3', label: 'موقع العمل والوحدة', value: 'مصنع السويس لمشتقات الميثانول - وحدة إنتاج الميثانول وراتنجات اليوريا' },
          { id: 'f4', label: 'معايير الجودة المعتمدة', value: 'مطابق للمواصفات القياسية لقطاع البترول والسلامة والصحة المهنية (OSHA)' },
          { id: 'f5', label: 'رقم إذن الصرف المخزني', value: 'WH-PPE-2026/894' }
        ],
        overlayFields: [
          { id: 'ov-name', label: 'اسم الموظف', value: 'م. مروان أشرف الشريف', xPercent: 24, yPercent: 28, fontSize: 13, isBold: true, color: '#0f172a' },
          { id: 'ov-id', label: 'كود الموظف (PIN)', value: '1001', xPercent: 74, yPercent: 28, fontSize: 13, isBold: true, color: '#1d4ed8' },
          { id: 'ov-dept', label: 'الإدارة / الموقع', value: 'السلامه والصحه المهنيه وحمايه البيئه', xPercent: 24, yPercent: 34, fontSize: 12, isBold: false, color: '#0f172a' },
          { id: 'ov-date', label: 'تاريخ الاستلام', value: new Date().toISOString().split('T')[0], xPercent: 74, yPercent: 34, fontSize: 12, isBold: false, color: '#0f172a' },
          { id: 'ov-items', label: 'المهمات المسلمة', value: 'خوذة أمان، حذاء سيفتي S3، نظارة حماية كيميائية، قناع أبخرة عضوية', xPercent: 24, yPercent: 47, fontSize: 12, isBold: true, color: '#0f172a', widthPx: 380 },
          { id: 'ov-order', label: 'إذن الصرف المخزني', value: 'WH-PPE-2026/894', xPercent: 24, yPercent: 55, fontSize: 12, isBold: false, color: '#0f172a' }
        ],
        footerNotes: '• أقر أنا الموظف بمسؤوليتي الكاملة عن الحفاظ على المهمات المسلمة واستخدامها طبقا للتعليمات المعتمدة.\n• في حالة التلف أو الفقد يتم إخطار مسؤول السلامة فوراً لاتخاذ إجراءات الاستبدال.',
        signatures: [
          { title: 'توقيع المستلم', name: 'الموظف المختص' },
          { title: 'مسؤول السلامة والصحة المهنية', name: 'م. حسام الشريف' },
          { title: 'مدير الإدارة', name: 'د. خالد توفيق' },
          { title: 'اعتماد مدير عام المصنع', name: 'خاتم شعار الشركة SMD' }
        ]
      },
      {
        formId: 'SMD-FORM-TRANSFER-02',
        formTitle: 'طلب نقل داخلي / تكليف بمهام إضافية',
        formCode: 'SMD-HR-08',
        category: 'الموارد البشرية',
        sourceType: 'word',
        sourceFileName: 'Internal_Transfer_SMD.docx',
        uploadedAt: '2026-11-05',
        description: 'نموذج رسمي لطلب النقل بين قطاعات الشركة أو التكليف بمهام مشروع توسعات الميثانول الجديد',
        headerPreamble: 'أرجو التكرم بالموافقة على النظر في طلب النقل الداخلي / التكليف بمهام إضافية طبقاً لمتطلبات صالح العمل والخبرات التراكمية بالشركة.',
        fields: [
          { id: 'f1', label: 'الإدارة المطلوب النقل إليها', value: 'قطاع سلامه العمليات / الشؤون الفنيه والتخطيط' },
          { id: 'f2', label: 'المسمى الوظيفي المقترح', value: 'مهندس أول عمليات وتنسيق فني' },
          { id: 'f3', label: 'أسباب ومبررات النقل', value: 'المشاركة في مشروع التوسعات الجديدة واستغلال الخبرات الميدانية في تشغيل الخط الثاني' },
          { id: 'f4', label: 'تاريخ بدء سريان التكليف', value: new Date().toISOString().split('T')[0] }
        ],
        overlayFields: [
          { id: 'ov-emp', label: 'اسم الموظف', value: 'م. مروان أشرف الشريف', xPercent: 25, yPercent: 26, fontSize: 13, isBold: true, color: '#0f172a' },
          { id: 'ov-pin', label: 'كود الموظف (PIN)', value: '1001', xPercent: 75, yPercent: 26, fontSize: 13, isBold: true, color: '#1d4ed8' },
          { id: 'ov-cur-dept', label: 'الإدارة الحالية', value: 'السلامه والصحه المهنيه', xPercent: 25, yPercent: 33, fontSize: 12, isBold: false, color: '#0f172a' },
          { id: 'ov-target-dept', label: 'الإدارة المنقول إليها', value: 'قطاع سلامه العمليات والتخطيط الفني', xPercent: 25, yPercent: 44, fontSize: 12, isBold: true, color: '#0f172a', widthPx: 350 }
        ],
        footerNotes: '• يتم تنفيذ النقل بعد موافقة مديري الإدارتين واعتماد الإدارة العامة للموارد البشرية.\n• يسلم الموظف كافة العهد والملفات للموظف البديل بموجب محضر تسليم رسمي.',
        signatures: [
          { title: 'توقيع الموظف', name: 'مقدم الطلب' },
          { title: 'موافقة الإدارة الحالية', name: 'المدير المباشر' },
          { title: 'موافقة الإدارة المنقول إليها', name: 'مدير الإدارة المستلمة' },
          { title: 'اعتماد الموارد البشرية', name: 'أ. محمد عبد الرحمن' }
        ]
      }
    ]);
  },
  saveCustomForms(forms: any[]): void {
    safeSet(KEYS.CUSTOM_FORMS, forms);
  },
  addCustomForm(form: any): void {
    const list = this.getCustomForms();
    list.unshift(form);
    this.saveCustomForms(list);
  },

  // Full Database Backup & Restore
  exportDatabaseAsJson(): void {
    const backup = {
      version: '1.0.0',
      company: 'Suez Methanol Derivatives Co. (SMD)',
      exportedAt: new Date().toISOString(),
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
        license: this.getLicense()
      }
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `نسخة_احتياطية_شاملة_SMD_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
    } catch (e) {
      console.error('Failed to import database JSON:', e);
      return false;
    }
  },

  // License & Time-Lock
  getLicense(): LicenseConfig {
    return safeGet<LicenseConfig>(KEYS.LICENSE, INITIAL_LICENSE);
  },
  saveLicense(lic: LicenseConfig): void {
    safeSet(KEYS.LICENSE, lic);
  },

  isSystemLocked(): { isLocked: boolean; reason?: string } {
    const lic = this.getLicense();
    if (lic.isTimeLocked) {
      return { isLocked: true, reason: 'تم إيقاف تشغيل النظام يدوياً بواسطة مستخدم النظام user (مستخدم).' };
    }
    const today = new Date().toISOString().split('T')[0];
    if (lic.expiryDate && today > lic.expiryDate) {
      return {
        isLocked: true,
        reason: `انتهت صلاحية ترخيص البرنامج في تاريخ ${lic.expiryDate}. يرجى تجديد الترخيص مع إدارة نظم المعلومات بشركة السويس لمشتقات الميثانول.`
      };
    }
    return { isLocked: false };
  },

  // Reset all to initial state
  resetAllData(): void {
    localStorage.removeItem(KEYS.EMPLOYEES);
    localStorage.removeItem(KEYS.LEAVE_BALANCES);
    localStorage.removeItem(KEYS.LEAVES);
    localStorage.removeItem(KEYS.PERMITS);
    localStorage.removeItem(KEYS.MISSIONS);
    localStorage.removeItem(KEYS.ATTENDANCE);
    localStorage.removeItem(KEYS.DEVICES);
    localStorage.removeItem(KEYS.BIOMETRIC_LOGS);
    localStorage.removeItem(KEYS.LICENSE);
    localStorage.removeItem(KEYS.CUSTOM_FORMS);
  }
};

/**
 * SMD - Suez Methanol Derivatives Co.
 * Core Types Definition
 */

export type UserRole = 'ADMIN' | 'VIEWER';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export type ShiftType = 'NORMAL_DAY' | 'DAY_SHIFT' | 'NIGHT_SHIFT';

export interface ShiftDefinition {
  id: ShiftType;
  nameAr: string;
  nameEn: string;
  startTime: string; // "08:00"
  endTime: string;   // "16:00" or "20:00" or "08:00" next day
  standardHours: number; // 8 or 12
  descriptionAr: string;
}

export const SMD_DEPARTMENTS = [
  'العلاقات العامه والاتصالات الحكوميه والامن الميداني',
  'الموارد البشريه',
  'الشؤون الماليه',
  'العمليات',
  'الشؤون الفنيه والتخطيط',
  'الصيانه',
  'التفتيش الهندسي والجوده',
  'الخدمات المساعده',
  'نظم المعلومات والاتصالات',
  'الشؤون التجاريه',
  'السلامه والصحه المهنيه وحمايه البيئه',
  'قطاع الدراسات الفنيه',
  'قطاع سلامه العمليات',
  'قطاع الشئون القانونيه والعقود',
  'قطاع المراجعه الداخليه',
  'اداره التسويق',
  'اداره الامانه العامه لمجلس الاداره ومكتب رئيس مجلس الاداره'
] as const;

export type SMDDepartment = typeof SMD_DEPARTMENTS[number];

export type ContractType = 'دائم' | 'محدد المدة' | 'مؤقت' | 'إعارة / انتداب';
export type JobGrade = 'مدير عام / قطاع' | 'مدير إدارة' | 'رئيس قسم' | 'أولى' | 'ثانية' | 'ثالثة' | 'رابعة' | 'فني / مهني';
export type WorkLocation = 'مصنع السويس لمشتقات الميثانول' | 'المقر الإداري الرئيسي' | 'ميناء الإسكندرية' | 'موقع دمياط';

export interface Employee {
  serial: number;             // م (الرقم التسلسلي)
  employeeId: string;         // كود الموظف (PIN في جهاز البصمة)
  name: string;               // الاسم بالكامل
  mobile: string;             // رقم المحمول
  email: string;              // البريد الإلكتروني
  currentTitle: string;       // المسمى الوظيفي الحالي
  position: string;           // الوظيفة
  assignedTitle: string;      // المسمى المكلف به
  department: string;         // الإدارة / القطاع
  contractType: ContractType; // نوع العقد
  grade: JobGrade;            // الدرجة الوظيفية
  workLocation: WorkLocation; // موقع العمل
  nationalId: string;         // الرقم القومي (14 رقم)
  insuranceId: string;        // الرقم التأميني
  hourlyRate: number;         // أجر الساعة لحساب الإضافي (بالجنيه)
  hireDate: string;           // تاريخ التعيين
  photoUrl?: string;          // صورة الموظف
  defaultShift: ShiftType;    // الوردية الافتراضية
  isActive: boolean;
  documents?: {
    id: string;
    title: string;
    fileType: 'pdf' | 'doc' | 'image';
    fileName: string;
    uploadDate: string;
    fileUrl?: string;
  }[];
}

export type LeaveType = 
  | 'اعتيادي'
  | 'عارضة'
  | 'عطلات رسمية'
  | 'مرضي'
  | 'وضع'
  | 'رعاية طفل'
  | 'حج وزيارة القدس'
  | 'امتحانات'
  | 'زواج'
  | 'وفاة'
  | 'أبوة'
  | 'بدون مرتب';

export interface LeaveBalance {
  employeeId: string;
  year: number;
  // Opening balances
  annualOpening: number;      // اعتيادي
  casualOpening: number;      // عارضة (عادة 6 أو 7 أيام)
  sickOpening: number;        // مرضي (يتجدد كل 3 سنوات طبقا لقانون العمل)
  sickCycleStartYear: number; // بداية دورة الـ 3 سنوات
  // Used
  annualUsed: number;
  casualUsed: number;
  sickUsed: number;
  otherUsed: number;
}

export interface LeaveRecord {
  id: string;
  employeeId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason?: string;
  replacementEmployeeId?: string;
  status: 'معتمد' | 'قيد المراجعة' | 'مرفوض';
  approvedBy?: string;
  approvalDate?: string;
  notes?: string;
}

export type PermitType = 'إذن شخصي' | 'إذن عمل';

export interface PermitRecord {
  id: string;
  employeeId: string;
  permitType: PermitType;
  date: string;
  startTime: string; // "10:00"
  endTime: string;   // "12:00"
  durationHours: number;
  reason: string;
  status: 'معتمد' | 'قيد الانتظار' | 'مرفوض';
  approvedBy?: string;
}

export type MissionType = 'مأمورية داخلية' | 'مأمورية ببدل' | 'مأمورية بدون بدل';

export interface MissionRecord {
  id: string;
  employeeId: string;
  missionType: MissionType;
  destination: string;
  purpose: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  allowancePerDay?: number;
  totalAllowance?: number;
  transportationType: 'سيارة الشركة' | 'قطار / حافلة' | 'طيران' | 'خاصة ببدل انتقال';
  status: 'معتمد' | 'قيد المراجعة' | 'مرفوض';
  approvedBy?: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;              // "YYYY-MM-DD"
  shiftType: ShiftType;
  checkIn: string;           // "07:55"
  checkOut: string;          // "19:45"
  workingHours: number;      // ساعات العمل الإجمالية
  standardHours: number;     // الساعات الأساسية للوردية
  
  // Overtime calculations
  overtimeHoursTotal: number;
  dayOvertimeHours: number;   // قبل الساعة 6:00 مساءً (× 1.35)
  nightOvertimeHours: number; // من 6:00 مساءً إلى 6:00 صباحاً (× 1.70)
  
  dayOvertimePay: number;     // القيمة المالية للإضافي النهاري
  nightOvertimePay: number;   // القيمة المالية للإضافي الليلي
  totalOvertimePay: number;   // إجمالي قيمة الإضافي المستحق
  
  source: 'ZKTeco-Biometric' | 'يدوي (معدل بواسطة المشرف)' | 'تطبيق محلي' | 'تصوير المستند (OCR Scan)' | 'استيراد ملف Excel';
  deviceId?: string;
  notes?: string;
  status: 'حاضر' | 'متأخر' | 'انصراف مبكر' | 'إضافي' | 'غياب' | 'إجازة' | 'مأمورية';
}

export interface ZKTecoDevice {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  commKey: number;
  location: string;
  status: 'connected' | 'disconnected' | 'syncing' | 'error';
  lastSync?: string;
  deviceModel?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  totalUsers?: number;
  totalLogs?: number;
  totalFingers?: number;
}

export interface BiometricLogEntry {
  id: string;
  deviceId: string;
  enrollNumber: string; // Employee ID
  timestamp: string;
  verifyMode: 'بصمة إصبع' | 'بصمة وجه' | 'كارت RFID' | 'كلمة سر';
  punchType: 'دخول' | 'خروج' | 'خروج مؤقت (إذن)' | 'عودة من إذن';
}

export interface LicenseConfig {
  companyName: string;
  licenseKey: string;
  expiryDate: string;       // "YYYY-MM-DD"
  isTimeLocked: boolean;    // Admin can manually trigger lock or it triggers on expiry
  licenseType: 'ترخيص تجاري دائم' | 'ترخيص سنوي للمؤسسة' | 'ترخيص تجريبي مقيد';
  maxEmployees: number;
  lastVerifiedAt: string;
}

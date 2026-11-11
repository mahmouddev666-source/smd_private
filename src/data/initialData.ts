/**
 * SMD - Suez Methanol Derivatives Co.
 * Demo seed data (clearly labelled, safe to delete).
 *
 * DEMO RULES:
 * - Every employee code starts at 9001 and every record carries `isDemo`.
 * - Real employee data can be imported later without colliding with these codes.
 * - `StorageService.resetDemoData()` removes this dataset only.
 */

import {
  AttendanceRecord,
  ContractType,
  Employee,
  JobGrade,
  LeaveBalance,
  LeaveRecord,
  LicenseConfig,
  MissionRecord,
  PermitRecord,
  ShiftType,
  WorkLocation,
  ZKTecoDevice,
} from '../types';
import {
  addDaysISO,
  isFriday,
  localDateISO,
  localTimestamp,
} from '../utils/dateUtils';
import { calculateOvertime, formatMinutesToTime } from '../utils/overtimeCalculator';

interface DemoEmployeeSeed {
  name: string;
  currentTitle: string;
  position: string;
  assignedTitle: string;
  department: string;
  contractType: ContractType;
  grade: JobGrade;
  workLocation: WorkLocation;
  hourlyRate: number;
  hireDate: string;
  defaultShift: ShiftType;
}

const DEMO_EMPLOYEE_SEEDS: DemoEmployeeSeed[] = [
  {
    name: 'م. أحمد محمود سعيد',
    currentTitle: 'مدير عام العمليات والإنتاج',
    position: 'مهندس عمليات أول',
    assignedTitle: 'المشرف العام على تشغيل وحدات الميثانول',
    department: 'العمليات',
    contractType: 'دائم',
    grade: 'مدير عام / قطاع',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    hourlyRate: 150.0,
    hireDate: '2015-03-01',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'أ. محمد عبد الرحمن إبراهيم',
    currentTitle: 'مدير الموارد البشرية وشؤون العاملين',
    position: 'مدير إدارة الموارد البشرية',
    assignedTitle: 'مدير شؤون الموظفين والاستحقاقات',
    department: 'الموارد البشريه',
    contractType: 'دائم',
    grade: 'مدير إدارة',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 120.0,
    hireDate: '2017-06-15',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'م. طارق حسن الشناوي',
    currentTitle: 'رئيس قسم الصيانة الميكانيكية',
    position: 'مهندس صيانة توربينات ومضخات',
    assignedTitle: 'قائد فريق طوارئ الصيانة',
    department: 'الصيانه',
    contractType: 'دائم',
    grade: 'رئيس قسم',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    hourlyRate: 95.0,
    hireDate: '2019-01-10',
    defaultShift: 'DAY_SHIFT',
  },
  {
    name: 'كيميائي/ سامح مصطفى خليل',
    currentTitle: 'أخصائي تفتيش هندسي وجودة ومختبرات',
    position: 'كيميائي مراقبة جودة المشتقات',
    assignedTitle: 'مسؤول الفحص الكيميائي للميثانول والفورمالدهيد',
    department: 'التفتيش الهندسي والجوده',
    contractType: 'دائم',
    grade: 'أولى',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    hourlyRate: 90.0,
    hireDate: '2020-04-01',
    defaultShift: 'NIGHT_SHIFT',
  },
  {
    name: 'م. ياسر علي البدري',
    currentTitle: 'مدير السلامة والصحة المهنية وحماية البيئة',
    position: 'استشاري سلامة عمليات كيميائية',
    assignedTitle: 'المسؤول الأول عن خطط الإخلاء والطوارئ HSE',
    department: 'السلامه والصحه المهنيه وحمايه البيئه',
    contractType: 'دائم',
    grade: 'مدير إدارة',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    hourlyRate: 110.0,
    hireDate: '2018-09-01',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'أ. نادية كمال الديب',
    currentTitle: 'رئيس قسم الحسابات العامة والشؤون المالية',
    position: 'محاسب أول تكاليف وموازنات',
    assignedTitle: 'المشرف على مستحقات ورواتب العاملين',
    department: 'الشؤون الماليه',
    contractType: 'دائم',
    grade: 'رئيس قسم',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 85.0,
    hireDate: '2019-11-15',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'م. كريم عصام الدسوقي',
    currentTitle: 'مهندس نظم معلومات وشبكات وأمن سيبراني',
    position: 'مهندس بنية تحتية وخوادم',
    assignedTitle: 'مسؤول منظومة البصمة ZKTeco وقواعد البيانات',
    department: 'نظم المعلومات والاتصالات',
    contractType: 'دائم',
    grade: 'ثانية',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 80.0,
    hireDate: '2021-08-01',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'المستشار/ هشام فؤاد رضوان',
    currentTitle: 'مدير قطاع الشؤون القانونية والعقود',
    position: 'مستشار قانوني',
    assignedTitle: 'رئيس لجنة التحقيقات والعقود البترولية',
    department: 'قطاع الشئون القانونيه والعقود',
    contractType: 'دائم',
    grade: 'مدير عام / قطاع',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 140.0,
    hireDate: '2016-02-01',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'أ. رانيا عادل سليمان',
    currentTitle: 'أخصائي أول علاقات عامة واتصالات حكومية',
    position: 'منسق علاقات حكومية وميدانية',
    assignedTitle: 'مسؤول التنسيق مع الهيئة العامة للبترول والجهات السيادية',
    department: 'العلاقات العامه والاتصالات الحكوميه والامن الميداني',
    contractType: 'محدد المدة',
    grade: 'ثانية',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 75.0,
    hireDate: '2022-03-15',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'م. إسلام فتحي منصور',
    currentTitle: 'مهندس أول دراسات فنية وتخطيط مشروعات',
    position: 'مهندس دراسات جدوى وهندسة كيميائية',
    assignedTitle: 'المشرف على مشروع التوسعات لمشتقات الميثانول',
    department: 'قطاع الدراسات الفنيه',
    contractType: 'دائم',
    grade: 'أولى',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 95.0,
    hireDate: '2019-07-01',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'أ. منى إبراهيم عطية',
    currentTitle: 'أخصائي شؤون عاملين وتأمينات',
    position: 'أخصائي موارد بشرية',
    assignedTitle: 'مسؤول ملفات التأمينات والمعاشات',
    department: 'الموارد البشريه',
    contractType: 'دائم',
    grade: 'ثالثة',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 70.0,
    hireDate: '2021-02-20',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'م. حسام الدين فؤاد',
    currentTitle: 'مهندس تشغيل وحدات الميثانول',
    position: 'مهندس عمليات مناوبة',
    assignedTitle: 'مسؤول وردية التشغيل الليلية',
    department: 'العمليات',
    contractType: 'دائم',
    grade: 'ثانية',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    hourlyRate: 92.0,
    hireDate: '2020-10-05',
    defaultShift: 'NIGHT_SHIFT',
  },
  {
    name: 'أ. شيماء صلاح الدين',
    currentTitle: 'محاسب حسابات دائنة وموردين',
    position: 'محاسب',
    assignedTitle: 'مسؤول مطابقات الموردين الشهرية',
    department: 'الشؤون الماليه',
    contractType: 'دائم',
    grade: 'ثالثة',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 68.0,
    hireDate: '2022-09-11',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'فني/ محمود رمضان عبده',
    currentTitle: 'فني صيانة ميكانيكية',
    position: 'فني صيانة',
    assignedTitle: 'فني وردية نهارية للصيانة الوقائية',
    department: 'الصيانه',
    contractType: 'دائم',
    grade: 'فني / مهني',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    hourlyRate: 55.0,
    hireDate: '2018-05-13',
    defaultShift: 'DAY_SHIFT',
  },
  {
    name: 'فني/ عمرو عبد الله حسن',
    currentTitle: 'فني تشغيل وحدات',
    position: 'فني عمليات',
    assignedTitle: 'فني وردية ليلية لمحطة المعالجة',
    department: 'العمليات',
    contractType: 'دائم',
    grade: 'فني / مهني',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    hourlyRate: 58.0,
    hireDate: '2019-08-25',
    defaultShift: 'NIGHT_SHIFT',
  },
  {
    name: 'أ. دينا مصطفى كامل',
    currentTitle: 'أخصائي تسويق ودراسات سوق',
    position: 'منسق تسويق',
    assignedTitle: 'مسؤول متابعة عملاء المشتقات',
    department: 'اداره التسويق',
    contractType: 'محدد المدة',
    grade: 'ثانية',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 72.0,
    hireDate: '2023-01-08',
    defaultShift: 'NORMAL_DAY',
  },
  {
    name: 'م. وليد سمير جاد',
    currentTitle: 'مهندس سلامة عمليات',
    position: 'مهندس HSE',
    assignedTitle: 'مسؤول تصاريح العمل الساخن',
    department: 'قطاع سلامه العمليات',
    contractType: 'دائم',
    grade: 'أولى',
    workLocation: 'مصنع السويس لمشتقات الميثانول',
    hourlyRate: 88.0,
    hireDate: '2020-12-01',
    defaultShift: 'DAY_SHIFT',
  },
  {
    name: 'أ. هالة أشرف زكي',
    currentTitle: 'سكرتير تنفيذي لمكتب رئيس مجلس الإدارة',
    position: 'سكرتير تنفيذي',
    assignedTitle: 'منسق اجتماعات مجلس الإدارة',
    department: 'اداره الامانه العامه لمجلس الاداره ومكتب رئيس مجلس الاداره',
    contractType: 'دائم',
    grade: 'ثالثة',
    workLocation: 'المقر الإداري الرئيسي',
    hourlyRate: 65.0,
    hireDate: '2021-11-30',
    defaultShift: 'NORMAL_DAY',
  },
];

const DEMO_FIRST_ID = 9001;

function demoMobile(serial: number): string {
  return `010${String(10000000 + serial * 137).slice(0, 8)}`;
}

function demoNationalId(serial: number): string {
  return `2${String(9000000000000 + serial).slice(0, 13)}`;
}

function demoEmail(name: string, serial: number): string {
  const latinPrefix = ['ahmed', 'mohamed', 'tarek', 'sameh', 'yasser', 'nadia', 'karim', 'hesham',
    'rania', 'islam', 'mona', 'hussein', 'shaimaa', 'mahmoud', 'amr', 'dina', 'walid', 'hala'];
  return `${latinPrefix[(serial - 1) % latinPrefix.length]}.demo${serial}@smd.com.eg`;
}

export const INITIAL_EMPLOYEES: Employee[] = DEMO_EMPLOYEE_SEEDS.map((seed, index) => {
  const serial = index + 1;
  return {
    serial,
    employeeId: String(DEMO_FIRST_ID + index),
    name: seed.name,
    mobile: demoMobile(serial),
    email: demoEmail(seed.name, serial),
    currentTitle: seed.currentTitle,
    position: seed.position,
    assignedTitle: seed.assignedTitle,
    department: seed.department,
    contractType: seed.contractType,
    grade: seed.grade,
    workLocation: seed.workLocation,
    nationalId: demoNationalId(serial),
    insuranceId: String(30000000 + serial * 977),
    hourlyRate: seed.hourlyRate,
    hireDate: seed.hireDate,
    defaultShift: seed.defaultShift,
    isActive: true,
    isDemo: true,
  };
});

export const INITIAL_LEAVE_BALANCES: LeaveBalance[] = INITIAL_EMPLOYEES.map((employee, index) => ({
  employeeId: employee.employeeId,
  year: new Date().getFullYear(),
  annualOpening: employee.grade.includes('مدير') ? 30 : 21,
  casualOpening: 7,
  sickOpening: 90,
  sickCycleStartYear: new Date().getFullYear() - (index % 3),
  annualUsed: (index * 3) % 12,
  casualUsed: index % 5,
  sickUsed: index % 2 === 0 ? 0 : (index * 2) % 6,
  otherUsed: 0,
}));

const TODAY = localDateISO();

export const INITIAL_LEAVES: LeaveRecord[] = [
  {
    id: 'LV-DEMO-9001',
    employeeId: '9001',
    leaveType: 'اعتيادي',
    startDate: addDaysISO(TODAY, -20),
    endDate: addDaysISO(TODAY, -15),
    daysCount: 6,
    reason: 'إجازة سنوية اعتيادية (بيانات تجريبية)',
    replacementEmployeeId: '9003',
    status: 'معتمد',
    approvedBy: 'مدير الموارد البشرية (تجريبي)',
    approvalDate: addDaysISO(TODAY, -22),
    notes: 'تم تسليم المهام للمهندس طارق الشناوي',
    isDemo: true,
  },
  {
    id: 'LV-DEMO-9002',
    employeeId: '9002',
    leaveType: 'مرضي',
    startDate: addDaysISO(TODAY, -9),
    endDate: addDaysISO(TODAY, -7),
    daysCount: 3,
    reason: 'تقرير طبي تجريبي - عيادة السويس',
    status: 'معتمد',
    approvedBy: 'مدير الشؤون الإدارية (تجريبي)',
    approvalDate: addDaysISO(TODAY, -6),
    isDemo: true,
  },
  {
    id: 'LV-DEMO-9003',
    employeeId: '9003',
    leaveType: 'عارضة',
    startDate: addDaysISO(TODAY, -4),
    endDate: addDaysISO(TODAY, -3),
    daysCount: 2,
    reason: 'ظرف عائلي طارئ (بيانات تجريبية)',
    status: 'قيد المراجعة',
    notes: 'بانتظار اعتماد مدير العمليات',
    isDemo: true,
  },
];

export const INITIAL_PERMITS: PermitRecord[] = [
  {
    id: 'PR-DEMO-9007',
    employeeId: '9007',
    permitType: 'إذن شخصي',
    date: addDaysISO(TODAY, -1),
    startTime: '12:00',
    endTime: '14:00',
    durationHours: 2,
    reason: 'مراجعة مصلحة الشهر العقاري بالسويس (بيانات تجريبية)',
    status: 'معتمد',
    approvedBy: 'أ. محمد عبد الرحمن (مدير الموارد البشرية)',
    isDemo: true,
  },
  {
    id: 'PR-DEMO-9004',
    employeeId: '9004',
    permitType: 'إذن عمل',
    date: TODAY,
    startTime: '10:30',
    endTime: '13:30',
    durationHours: 3,
    reason: 'سحب عينات ميثانول عشوائية من ميناء الأدبية بالسويس',
    status: 'قيد الانتظار',
    isDemo: true,
  },
];

export const INITIAL_MISSIONS: MissionRecord[] = [
  {
    id: 'MS-DEMO-9005',
    employeeId: '9005',
    missionType: 'مأمورية ببدل',
    destination: 'الهيئة المصرية العامة للبترول - القاهرة',
    purpose: 'حضور ورشة عمل اللجنة العليا للسلامة والصحة المهنية',
    startDate: addDaysISO(TODAY, -6),
    endDate: addDaysISO(TODAY, -4),
    daysCount: 3,
    allowancePerDay: 450,
    totalAllowance: 1350,
    transportationType: 'سيارة الشركة',
    status: 'معتمد',
    approvedBy: 'مكتب رئيس مجلس الإدارة',
    isDemo: true,
  },
  {
    id: 'MS-DEMO-9009',
    employeeId: '9009',
    missionType: 'مأمورية داخلية',
    destination: 'ديوان عام محافظة السويس والمنطقة الاقتصادية لقناة السويس',
    purpose: 'إنهاء تصاريح التوسعات الجديدة للخط الرابع للميثانول',
    startDate: TODAY,
    endDate: TODAY,
    daysCount: 1,
    allowancePerDay: 0,
    totalAllowance: 0,
    transportationType: 'سيارة الشركة',
    status: 'قيد المراجعة',
    isDemo: true,
  },
];

interface DemoShiftTimes {
  checkIn: string;
  checkOut: string;
}

function demoShiftTimes(shift: ShiftType, seed: number): DemoShiftTimes {
  const pad = (n: number) => String(n).padStart(2, '0');
  const arrivalMinute = seed % 12;
  const extraMinutes = seed % 3 === 0 ? 30 + (seed % 90) : seed % 8;

  if (shift === 'NIGHT_SHIFT') {
    return {
      checkIn: `19:${pad(45 + (seed % 10))}`,
      // Scheduled end is 08:00 next morning.
      checkOut: formatMinutesToTime(8 * 60 + extraMinutes),
    };
  }
  if (shift === 'DAY_SHIFT') {
    return {
      checkIn: `07:${pad(45 + arrivalMinute)}`,
      checkOut: formatMinutesToTime(20 * 60 + extraMinutes),
    };
  }
  return {
    checkIn: `07:${pad(45 + arrivalMinute)}`,
    checkOut: formatMinutesToTime(16 * 60 + extraMinutes),
  };
}

/**
 * Generates 30 days of demo attendance (ending today, Cairo time).
 * Deterministic so the same dataset is produced on every reset.
 * One record per employee per day - duplicates are impossible by construction.
 */
export function generateInitialAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const today = localDateISO();

  for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
    const date = addDaysISO(today, -dayOffset);
    const friday = isFriday(date);

    INITIAL_EMPLOYEES.forEach((employee, index) => {
      // Friday is the weekly rest day for day workers; shift crews keep running.
      if (friday && employee.defaultShift !== 'NIGHT_SHIFT') return;

      const seed = (index + 1) * 17 + dayOffset * 31;
      const isAbsent = seed % 37 === 0;
      const times = demoShiftTimes(employee.defaultShift, seed);
      const hourlyRate = employee.hourlyRate;

      if (isAbsent) {
        records.push({
          id: `ATT-DEMO-${employee.employeeId}-${date}`,
          employeeId: employee.employeeId,
          date,
          shiftType: employee.defaultShift,
          checkIn: '—',
          checkOut: '—',
          workingHours: 0,
          standardHours: employee.defaultShift === 'NORMAL_DAY' ? 8 : 12,
          overtimeHoursTotal: 0,
          dayOvertimeHours: 0,
          nightOvertimeHours: 0,
          dayOvertimePay: 0,
          nightOvertimePay: 0,
          totalOvertimePay: 0,
          source: 'تطبيق محلي',
          status: 'غياب',
          notes: 'بيانات تجريبية — غياب بدون إذن',
          isDemo: true,
        });
        return;
      }

      const overtime = calculateOvertime(employee.defaultShift, times.checkIn, times.checkOut, hourlyRate);

      records.push({
        id: `ATT-DEMO-${employee.employeeId}-${date}`,
        employeeId: employee.employeeId,
        date,
        shiftType: employee.defaultShift,
        checkIn: times.checkIn,
        checkOut: times.checkOut,
        workingHours: overtime.actualWorkedHours,
        standardHours: overtime.standardHours,
        overtimeHoursTotal: overtime.totalOvertimeHours,
        dayOvertimeHours: overtime.dayOvertimeHours,
        nightOvertimeHours: overtime.nightOvertimeHours,
        dayOvertimePay: overtime.dayOvertimePay,
        nightOvertimePay: overtime.nightOvertimePay,
        totalOvertimePay: overtime.totalOvertimePay,
        source: 'ZKTeco-Biometric',
        deviceId: index % 3 === 0 ? 'ZK-02' : 'ZK-01',
        status: overtime.suggestedStatus,
        notes: 'بيانات حضور تجريبية تم توليدها آلياً',
        isDemo: true,
      });
    });
  }

  // Newest first, matching the UI expectation.
  return records.sort((a, b) => (a.date === b.date ? a.employeeId.localeCompare(b.employeeId) : b.date.localeCompare(a.date)));
}

export const INITIAL_DEVICES: ZKTecoDevice[] = [
  {
    id: 'ZK-01',
    name: 'جهاز بصمة البوابة الرئيسية والمقر الإداري',
    ipAddress: '192.168.1.201',
    port: 4370,
    commKey: 0,
    location: 'بوابة السويس - المقر الإداري',
    status: 'disconnected',
    lastSync: localTimestamp(),
    deviceModel: 'ZKTeco IN01-A Fingerprint & RFID (بيانات تجريبية)',
    serialNumber: 'ZK-SMD-IN01-88491',
    firmwareVersion: 'Ver 8.0.4.3-2025',
    totalUsers: INITIAL_EMPLOYEES.length,
    totalLogs: 0,
    totalFingers: INITIAL_EMPLOYEES.length * 2,
    isDemo: true,
  },
  {
    id: 'ZK-02',
    name: 'جهاز بصمة مبنى العمليات وغرفة التحكم المركزية',
    ipAddress: '192.168.1.202',
    port: 4370,
    commKey: 0,
    location: 'مصنع السويس - مبنى العمليات والمختبرات',
    status: 'disconnected',
    lastSync: localTimestamp(),
    deviceModel: 'ZKTeco SilkBio-101TC (Face & Finger) — بيانات تجريبية',
    serialNumber: 'ZK-SMD-SBIO-99120',
    firmwareVersion: 'Ver 9.1.2-FacePro',
    totalUsers: INITIAL_EMPLOYEES.length,
    totalLogs: 0,
    totalFingers: INITIAL_EMPLOYEES.length * 2,
    isDemo: true,
  },
];

export const INITIAL_LICENSE: LicenseConfig = {
  companyName: 'شركة السويس لمشتقات الميثانول - SMD (Suez Methanol Derivatives Co.)',
  licenseKey: 'SMD-DEMO-2027-ENTERPRISE',
  expiryDate: '2027-12-31',
  isTimeLocked: false,
  licenseType: 'ترخيص تجريبي مقيد',
  maxEmployees: 500,
  lastVerifiedAt: TODAY,
};

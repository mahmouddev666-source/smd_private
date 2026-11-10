/**
 * SMD - Suez Methanol Derivatives Co.
 * Initial Enterprise Seed Data
 */

import { Employee, LeaveBalance, LeaveRecord, PermitRecord, MissionRecord, AttendanceRecord, ZKTecoDevice, LicenseConfig, SMD_DEPARTMENTS } from '../types';
import { calculateOvertime } from '../utils/overtimeCalculator';

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    serial: 1,
    employeeId: "1001",
    name: "م. أحمد محمود سعيد",
    mobile: "01001234567",
    email: "a.mahmoud@smd.com.eg",
    currentTitle: "مدير عام العمليات والإنتاج",
    position: "مهندس عمليات أول",
    assignedTitle: "المشرف العام على تشغيل وحدات الميثانول",
    department: "العمليات",
    contractType: "دائم",
    grade: "مدير عام / قطاع",
    workLocation: "مصنع السويس لمشتقات الميثانول",
    nationalId: "28504121401234",
    insuranceId: "45879120",
    hourlyRate: 150.0,
    hireDate: "2015-03-01",
    defaultShift: "NORMAL_DAY",
    isActive: true,
    photoUrl: "/assets/aistudio/logo_ba9cef12.jpg"
  },
  {
    serial: 2,
    employeeId: "1002",
    name: "أ. محمد عبد الرحمن إبراهيم",
    mobile: "01112345678",
    email: "m.abdelrahman@smd.com.eg",
    currentTitle: "مدير الموارد البشرية وشؤون العاملين",
    position: "مدير إدارة الموارد البشرية",
    assignedTitle: "مدير شؤون الموظفين والاستحقاقات",
    department: "الموارد البشريه",
    contractType: "دائم",
    grade: "مدير إدارة",
    workLocation: "المقر الإداري الرئيسي",
    nationalId: "28809151802345",
    insuranceId: "38910452",
    hourlyRate: 120.0,
    hireDate: "2017-06-15",
    defaultShift: "NORMAL_DAY",
    isActive: true
  },
  {
    serial: 3,
    employeeId: "1003",
    name: "م. طارق حسن الشناوي",
    mobile: "01223456789",
    email: "t.elshenawy@smd.com.eg",
    currentTitle: "رئيس قسم الصيانة الميكانيكية",
    position: "مهندس صيانة توربينات ومضخات",
    assignedTitle: "قائد فريق طوارئ الصيانة",
    department: "الصيانه",
    contractType: "دائم",
    grade: "رئيس قسم",
    workLocation: "مصنع السويس لمشتقات الميثانول",
    nationalId: "29007202103456",
    insuranceId: "51203498",
    hourlyRate: 95.0,
    hireDate: "2019-01-10",
    defaultShift: "DAY_SHIFT",
    isActive: true
  },
  {
    serial: 4,
    employeeId: "1004",
    name: "كيميائي/ سامح مصطفى خليل",
    mobile: "01098765432",
    email: "s.khalil@smd.com.eg",
    currentTitle: "أخصائي تفتيش هندسي وجودة ومختبرات",
    position: "كيميائي مراقبة جودة المشتقات",
    assignedTitle: "مسؤول الفحص الكيميائي للميثانول والفورمالدهيد",
    department: "التفتيش الهندسي والجوده",
    contractType: "دائم",
    grade: "أولى",
    workLocation: "مصنع السويس لمشتقات الميثانول",
    nationalId: "29211050104567",
    insuranceId: "62341098",
    hourlyRate: 90.0,
    hireDate: "2020-04-01",
    defaultShift: "NIGHT_SHIFT",
    isActive: true
  },
  {
    serial: 5,
    employeeId: "1005",
    name: "م. ياسر علي البدري",
    mobile: "01156789012",
    email: "y.elbadry@smd.com.eg",
    currentTitle: "مدير السلامة والصحة المهنية وحماية البيئة",
    position: "استشاري سلامة عمليات كيميائية",
    assignedTitle: "المسؤول الأول عن خطط الإخلاء والطوارئ HSE",
    department: "السلامه والصحه المهنيه وحمايه البيئه",
    contractType: "دائم",
    grade: "مدير إدارة",
    workLocation: "مصنع السويس لمشتقات الميثانول",
    nationalId: "28703181405678",
    insuranceId: "47812903",
    hourlyRate: 110.0,
    hireDate: "2018-09-01",
    defaultShift: "NORMAL_DAY",
    isActive: true
  },
  {
    serial: 6,
    employeeId: "1006",
    name: "أ. نادية كمال الديب",
    mobile: "01278901234",
    email: "n.eldeeb@smd.com.eg",
    currentTitle: "رئيس قسم الحسابات العامة والشؤون المالية",
    position: "محاسب أول تكاليف وموازنات",
    assignedTitle: "المشرف على مستحقات ورواتب العاملين",
    department: "الشؤون الماليه",
    contractType: "دائم",
    grade: "رئيس قسم",
    workLocation: "المقر الإداري الرئيسي",
    nationalId: "29108250106789",
    insuranceId: "58901243",
    hourlyRate: 85.0,
    hireDate: "2019-11-15",
    defaultShift: "NORMAL_DAY",
    isActive: true
  },
  {
    serial: 7,
    employeeId: "1007",
    name: "م. كريم عصام الدسوقي",
    mobile: "01067891234",
    email: "k.eldesouky@smd.com.eg",
    currentTitle: "مهندس نظم معلومات وشبكات وأمن سيبراني",
    position: "مهندس بنية تحتية وخوادم",
    assignedTitle: "مسؤول منظومة البصمة ZKTeco وقواعد البيانات",
    department: "نظم المعلومات والاتصالات",
    contractType: "دائم",
    grade: "ثانية",
    workLocation: "المقر الإداري الرئيسي",
    nationalId: "29402141707890",
    insuranceId: "69012354",
    hourlyRate: 80.0,
    hireDate: "2021-08-01",
    defaultShift: "NORMAL_DAY",
    isActive: true
  },
  {
    serial: 8,
    employeeId: "1008",
    name: "المستشار/ هشام فؤاد رضوان",
    mobile: "01123459876",
    email: "h.radwan@smd.com.eg",
    currentTitle: "مدير قطاع الشؤون القانونية والعقود",
    position: "مستشار قانوني",
    assignedTitle: "رئيس لجنة التحقيقات والعقود البترولية",
    department: "قطاع الشئون القانونيه والعقود",
    contractType: "دائم",
    grade: "مدير عام / قطاع",
    workLocation: "المقر الإداري الرئيسي",
    nationalId: "28306111408901",
    insuranceId: "36789012",
    hourlyRate: 140.0,
    hireDate: "2016-02-01",
    defaultShift: "NORMAL_DAY",
    isActive: true
  },
  {
    serial: 9,
    employeeId: "1009",
    name: "أ. رانيا عادل سليمان",
    mobile: "01234567123",
    email: "r.soliman@smd.com.eg",
    currentTitle: "أخصائي أول علاقات عامة واتصالات حكومية",
    position: "منسق علاقات حكومية وميدانية",
    assignedTitle: "مسؤول التنسيق مع الهيئة العامة للبترول والجهات السيادية",
    department: "العلاقات العامه والاتصالات الحكوميه والامن الميداني",
    contractType: "محدد المدة",
    grade: "ثانية",
    workLocation: "المقر الإداري الرئيسي",
    nationalId: "29505190109012",
    insuranceId: "71234567",
    hourlyRate: 75.0,
    hireDate: "2022-03-15",
    defaultShift: "NORMAL_DAY",
    isActive: true
  },
  {
    serial: 10,
    employeeId: "1010",
    name: "م. إسلام فتحي منصور",
    mobile: "01011223344",
    email: "i.mansour@smd.com.eg",
    currentTitle: "مهندس أول دراسات فنية وتخطيط مشروعات",
    position: "مهندس دراسات جدوى وهندسة كيميائية",
    assignedTitle: "المشرف على مشروع التوسعات لمشتقات الميثانول",
    department: "قطاع الدراسات الفنيه",
    contractType: "دائم",
    grade: "أولى",
    workLocation: "المقر الإداري الرئيسي",
    nationalId: "29012010101234",
    insuranceId: "54321098",
    hourlyRate: 95.0,
    hireDate: "2019-07-01",
    defaultShift: "NORMAL_DAY",
    isActive: true
  }
];

export const INITIAL_LEAVE_BALANCES: LeaveBalance[] = [
  {
    employeeId: "1001",
    year: 2026,
    annualOpening: 30,
    casualOpening: 7,
    sickOpening: 90, // تجدد كل 3 سنوات طبقا لقانون العمل المصري
    sickCycleStartYear: 2025,
    annualUsed: 6,
    casualUsed: 2,
    sickUsed: 0,
    otherUsed: 0
  },
  {
    employeeId: "1002",
    year: 2026,
    annualOpening: 30,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2025,
    annualUsed: 4,
    casualUsed: 1,
    sickUsed: 3,
    otherUsed: 0
  },
  {
    employeeId: "1003",
    year: 2026,
    annualOpening: 21,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2026,
    annualUsed: 5,
    casualUsed: 3,
    sickUsed: 0,
    otherUsed: 0
  },
  {
    employeeId: "1004",
    year: 2026,
    annualOpening: 21,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2026,
    annualUsed: 2,
    casualUsed: 1,
    sickUsed: 0,
    otherUsed: 0
  },
  {
    employeeId: "1005",
    year: 2026,
    annualOpening: 30,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2024,
    annualUsed: 8,
    casualUsed: 2,
    sickUsed: 5,
    otherUsed: 0
  },
  {
    employeeId: "1006",
    year: 2026,
    annualOpening: 21,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2025,
    annualUsed: 3,
    casualUsed: 0,
    sickUsed: 0,
    otherUsed: 0
  },
  {
    employeeId: "1007",
    year: 2026,
    annualOpening: 21,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2026,
    annualUsed: 1,
    casualUsed: 2,
    sickUsed: 0,
    otherUsed: 0
  },
  {
    employeeId: "1008",
    year: 2026,
    annualOpening: 30,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2024,
    annualUsed: 10,
    casualUsed: 1,
    sickUsed: 0,
    otherUsed: 0
  },
  {
    employeeId: "1009",
    year: 2026,
    annualOpening: 21,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2025,
    annualUsed: 4,
    casualUsed: 2,
    sickUsed: 0,
    otherUsed: 0
  },
  {
    employeeId: "1010",
    year: 2026,
    annualOpening: 21,
    casualOpening: 7,
    sickOpening: 90,
    sickCycleStartYear: 2025,
    annualUsed: 3,
    casualUsed: 1,
    sickUsed: 0,
    otherUsed: 0
  }
];

export const INITIAL_LEAVES: LeaveRecord[] = [
  {
    id: "LV-2026-001",
    employeeId: "1001",
    leaveType: "اعتيادي",
    startDate: "2026-10-10",
    endDate: "2026-10-15",
    daysCount: 6,
    reason: "إجازة سنوية اعتيادية",
    replacementEmployeeId: "1003",
    status: "معتمد",
    approvedBy: "رئيس مجلس الإدارة والعضو المنتدب",
    approvalDate: "2026-10-08",
    notes: "تم تسليم المهام للمهندس طارق الشناوي"
  },
  {
    id: "LV-2026-002",
    employeeId: "1002",
    leaveType: "مرضي",
    startDate: "2026-10-18",
    endDate: "2026-10-20",
    daysCount: 3,
    reason: "تقرير طبي من التأمين الصحي - عيادة السويس",
    status: "معتمد",
    approvedBy: "مدير الشؤون الإدارية",
    approvalDate: "2026-10-21",
    notes: "معتمد بالتقرير الطبي المرفق رقم 9812"
  },
  {
    id: "LV-2026-003",
    employeeId: "1003",
    leaveType: "عارضة",
    startDate: "2026-10-25",
    endDate: "2026-10-26",
    daysCount: 2,
    reason: "ظرف عائلي طارئ",
    status: "معتمد",
    approvedBy: "مدير عام العمليات",
    approvalDate: "2026-10-27"
  }
];

export const INITIAL_PERMITS: PermitRecord[] = [
  {
    id: "PR-2026-101",
    employeeId: "1007",
    permitType: "إذن شخصي",
    date: "2026-11-01",
    startTime: "12:00",
    endTime: "14:00",
    durationHours: 2,
    reason: "مراجعة مصلحة الشهر العقاري بالسويس لإنهاء معاملة شخصية",
    status: "معتمد",
    approvedBy: "أ. محمد عبد الرحمن (مدير الموارد البشرية)"
  },
  {
    id: "PR-2026-102",
    employeeId: "1004",
    permitType: "إذن عمل",
    date: "2026-11-02",
    startTime: "10:30",
    endTime: "13:30",
    durationHours: 3,
    reason: "سحب عينات ميثانول عشوائية من ميناء الأدبية بالسويس",
    status: "معتمد",
    approvedBy: "م. أحمد محمود (مدير العمليات)"
  }
];

export const INITIAL_MISSIONS: MissionRecord[] = [
  {
    id: "MS-2026-051",
    employeeId: "1005",
    missionType: "مأمورية ببدل",
    destination: "الهيئة المصرية العامة للبترول - القاهرة",
    purpose: "حضور ورشة عمل اللجنة العليا للسلامة والصحة المهنية لقطاع البترول",
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    daysCount: 3,
    allowancePerDay: 450,
    totalAllowance: 1350,
    transportationType: "سيارة الشركة",
    status: "معتمد",
    approvedBy: "مكتب رئيس مجلس الإدارة"
  },
  {
    id: "MS-2026-052",
    employeeId: "1009",
    missionType: "مأمورية داخلية",
    destination: "ديوان عام محافظة السويس والمنطقة الاقتصادية لقناة السويس",
    purpose: "إنهاء تصاريح التوسعات الجديدة للخط الرابع للميثانول",
    startDate: "2026-10-28",
    endDate: "2026-10-28",
    daysCount: 1,
    allowancePerDay: 0,
    totalAllowance: 0,
    transportationType: "سيارة الشركة",
    status: "معتمد",
    approvedBy: "مدير قطاع العلاقات العامة"
  }
];

/**
 * Realistic initial attendance logs showcasing the exact business logic:
 * 1. Employee 1001 (Normal Day 08:00 - 16:00): worked 07:55 - 20:00!
 *    Post-shift overtime: 16:00 -> 20:00 (4 hours)
 *    16:00 -> 18:00: 2 hours day @ 1.35
 *    18:00 -> 20:00: 2 hours night @ 1.70
 * 2. Employee 1004 (Night Shift 20:00 - 08:00): worked 19:50 - 02:00 extended or overtime!
 */
export function generateInitialAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];

  // Record 1: Exact prompt example 1 - Normal Day extended to 8:00 PM
  const ot1 = calculateOvertime('NORMAL_DAY', '07:55', '20:00', 150.0);
  records.push({
    id: "ATT-2026-001",
    employeeId: "1001",
    date: "2026-11-01",
    shiftType: "NORMAL_DAY",
    checkIn: "07:55",
    checkOut: "20:00",
    workingHours: ot1.actualWorkedHours,
    standardHours: 8,
    overtimeHoursTotal: ot1.totalOvertimeHours,
    dayOvertimeHours: ot1.dayOvertimeHours,
    nightOvertimeHours: ot1.nightOvertimeHours,
    dayOvertimePay: ot1.dayOvertimePay,
    nightOvertimePay: ot1.nightOvertimePay,
    totalOvertimePay: ot1.totalOvertimePay,
    source: "ZKTeco-Biometric",
    deviceId: "ZK-01",
    status: "إضافي",
    notes: "عمل إضافي طارئ لمتابعة ضخ الميثانول (ساعتان نهاري 1.35 + ساعتان ليلي 1.70)"
  });

  // Record 2: Normal Day on time
  const ot2 = calculateOvertime('NORMAL_DAY', '08:02', '16:05', 120.0);
  records.push({
    id: "ATT-2026-002",
    employeeId: "1002",
    date: "2026-11-01",
    shiftType: "NORMAL_DAY",
    checkIn: "08:02",
    checkOut: "16:05",
    workingHours: ot2.actualWorkedHours,
    standardHours: 8,
    overtimeHoursTotal: ot2.totalOvertimeHours,
    dayOvertimeHours: ot2.dayOvertimeHours,
    nightOvertimeHours: ot2.nightOvertimeHours,
    dayOvertimePay: ot2.dayOvertimePay,
    nightOvertimePay: ot2.nightOvertimePay,
    totalOvertimePay: ot2.totalOvertimePay,
    source: "ZKTeco-Biometric",
    deviceId: "ZK-01",
    status: "حاضر",
    notes: "التزام كامل بمواعيد الحضور والانصراف المقررة"
  });

  // Record 3: Day Shift (08:00 - 20:00) with 1.5h night overtime (ended at 21:30)
  const ot3 = calculateOvertime('DAY_SHIFT', '07:45', '21:30', 95.0);
  records.push({
    id: "ATT-2026-003",
    employeeId: "1003",
    date: "2026-11-01",
    shiftType: "DAY_SHIFT",
    checkIn: "07:45",
    checkOut: "21:30",
    workingHours: ot3.actualWorkedHours,
    standardHours: 12,
    overtimeHoursTotal: ot3.totalOvertimeHours,
    dayOvertimeHours: ot3.dayOvertimeHours,
    nightOvertimeHours: ot3.nightOvertimeHours,
    dayOvertimePay: ot3.dayOvertimePay,
    nightOvertimePay: ot3.nightOvertimePay,
    totalOvertimePay: ot3.totalOvertimePay,
    source: "ZKTeco-Biometric",
    deviceId: "ZK-02",
    status: "إضافي",
    notes: "وردية نهارية 12 ساعة + 1.5 ساعة إضافي ليلي بعد الثامنة مساءً"
  });

  // Record 4: Normal Day with 1.5 hour day overtime (left at 17:30)
  const ot4 = calculateOvertime('NORMAL_DAY', '07:50', '17:30', 80.0);
  records.push({
    id: "ATT-2026-004",
    employeeId: "1007",
    date: "2026-11-01",
    shiftType: "NORMAL_DAY",
    checkIn: "07:50",
    checkOut: "17:30",
    workingHours: ot4.actualWorkedHours,
    standardHours: 8,
    overtimeHoursTotal: ot4.totalOvertimeHours,
    dayOvertimeHours: ot4.dayOvertimeHours,
    nightOvertimeHours: ot4.nightOvertimeHours,
    dayOvertimePay: ot4.dayOvertimePay,
    nightOvertimePay: ot4.nightOvertimePay,
    totalOvertimePay: ot4.totalOvertimePay,
    source: "ZKTeco-Biometric",
    deviceId: "ZK-01",
    status: "إضافي",
    notes: "تحديث خوادم البصمة وشبكة الاتصالات - إضافي نهاري بالكامل قبل 6:00 م"
  });

  return records;
}

export const INITIAL_DEVICES: ZKTecoDevice[] = [
  {
    id: "ZK-01",
    name: "جهاز بصمة البوابة الرئيسية والمقر الإداري",
    ipAddress: "192.168.1.201",
    port: 4370,
    commKey: 0,
    location: "بوابة السويس - المقر الإداري",
    status: "connected",
    lastSync: "2026-11-02 08:30:15",
    deviceModel: "ZKTeco IN01-A Fingerprint & RFID",
    serialNumber: "ZK-SMD-IN01-88491",
    firmwareVersion: "Ver 8.0.4.3-2025",
    totalUsers: 142,
    totalLogs: 12450,
    totalFingers: 284
  },
  {
    id: "ZK-02",
    name: "جهاز بصمة مبنى العمليات وغرفة التحكم المركزية",
    ipAddress: "192.168.1.202",
    port: 4370,
    commKey: 0,
    location: "مصنع السويس - مبنى العمليات والمختبرات",
    status: "connected",
    lastSync: "2026-11-02 08:15:00",
    deviceModel: "ZKTeco SilkBio-101TC (Face & Finger)",
    serialNumber: "ZK-SMD-SBIO-99120",
    firmwareVersion: "Ver 9.1.2-FacePro",
    totalUsers: 85,
    totalLogs: 8320,
    totalFingers: 170
  }
];

export const INITIAL_LICENSE: LicenseConfig = {
  companyName: "شركة السويس لمشتقات الميثانول - SMD (Suez Methanol Derivatives Co.)",
  licenseKey: "SMD-2027-ENTERPRISE-PRO-9842A-EGYPT",
  expiryDate: "2027-12-31",
  isTimeLocked: false,
  licenseType: "ترخيص سنوي للمؤسسة",
  maxEmployees: 500,
  lastVerifiedAt: "2026-11-02"
};

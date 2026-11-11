/**
 * SMD - Suez Methanol Derivatives Co.
 * Core Overtime Calculation Engine
 *
 * Business Rules:
 * 1. Shifts:
 *    - NORMAL_DAY: 08:00 -> 16:00 (8 Hours)
 *    - DAY_SHIFT:  08:00 -> 20:00 (12 Hours)
 *    - NIGHT_SHIFT: 20:00 -> 08:00 next morning (12 Hours)
 *
 * 2. Overtime Cutoff: 18:00 (6:00 PM) is the strict dividing line!
 * 3. Overtime Rates:
 *    - Day Period (06:00 - 18:00): Hourly Rate * 1.35
 *    - Night Period (18:00 - 06:00 next day): Hourly Rate * 1.70
 *
 * Examples tested:
 * - Normal Day ends at 16:00, works till 20:00:
 *   16:00 - 18:00 = 2 hours @ 1.35
 *   18:00 - 20:00 = 2 hours @ 1.70
 *   Total = 4 hours overtime
 *
 * - Night Shift ends at 00:00 midnight, extends to 02:00 AM:
 *   00:00 - 02:00 = 2 hours @ 1.70
 *
 * The engine never returns NaN. Invalid times are reported explicitly so the
 * UI can ask the user to correct the input instead of storing corrupt payroll.
 */

import { AttendanceRecord, ShiftType } from '../types';
import { normalizeTime } from './dateUtils';

/** Minutes of grace before an arrival counts as "late". */
export const LATE_GRACE_MINUTES = 15;
/** Minutes of grace before a departure counts as "early leave". */
export const EARLY_LEAVE_GRACE_MINUTES = 15;

export interface OvertimeBreakdown {
  /** False when check-in/check-out cannot be parsed; all numeric fields are 0. */
  isValid: boolean;
  standardHours: number;
  actualWorkedHours: number;
  totalOvertimeHours: number;
  dayOvertimeHours: number;    // Hours worked in day bracket (06:00 -> 18:00)
  nightOvertimeHours: number;  // Hours worked in night bracket (18:00 -> 06:00)
  dayMultiplier: number;       // 1.35
  nightMultiplier: number;     // 1.70
  effectivePaidHours: number;  // dayOT * 1.35 + nightOT * 1.70
  dayOvertimePay: number;
  nightOvertimePay: number;
  totalOvertimePay: number;
  lateMinutes: number;         // Arrival after the scheduled shift start
  earlyLeaveMinutes: number;   // Departure before the scheduled shift end
  suggestedStatus: AttendanceRecord['status'];
  explanationSteps: string[];
}

const SHIFT_CONFIG: Record<ShiftType, { start: number; end: number; standardHours: number; label: string }> = {
  NORMAL_DAY: { start: 8 * 60, end: 16 * 60, standardHours: 8, label: 'يوم عمل عادي (08:00 - 16:00)' },
  DAY_SHIFT: { start: 8 * 60, end: 20 * 60, standardHours: 12, label: 'وردية نهارية (08:00 - 20:00)' },
  NIGHT_SHIFT: { start: 20 * 60, end: 32 * 60, standardHours: 12, label: 'وردية ليلية (20:00 - 08:00)' },
};

/**
 * Converts "HH:mm" time string into minutes from start of reference day (0 to 1439).
 * Returns `null` for anything that is not a valid 24h time.
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  const normalized = normalizeTime(timeStr);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesToTime(mins: number): string {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

const roundHours = (minutes: number): number => Number((minutes / 60).toFixed(2));
const roundMoney = (value: number): number => Number(value.toFixed(2));

/** Splits an overtime interval into day (06:00-18:00) and night minutes. */
function splitOvertimeMinutes(startMins: number, endMins: number): { day: number; night: number } {
  let day = 0;
  let night = 0;
  const safeStart = Math.max(0, Math.floor(startMins));
  const safeEnd = Math.max(safeStart, Math.floor(endMins));
  // Guard against absurd input (more than 7 days).
  const cappedEnd = Math.min(safeEnd, safeStart + 7 * 24 * 60);
  for (let m = safeStart; m < cappedEnd; m += 1) {
    const clockMinute = m % 1440;
    if (clockMinute >= 6 * 60 && clockMinute < 18 * 60) {
      day += 1;
    } else {
      night += 1;
    }
  }
  return { day, night };
}

export function calculateOvertime(
  shiftType: ShiftType,
  checkIn: string,
  checkOut: string,
  hourlyRate: number = 85.0
): OvertimeBreakdown {
  const steps: string[] = [];
  const shift = SHIFT_CONFIG[shiftType] ?? SHIFT_CONFIG.NORMAL_DAY;
  const safeRate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 0;

  const empty = (message: string): OvertimeBreakdown => ({
    isValid: false,
    standardHours: shift.standardHours,
    actualWorkedHours: 0,
    totalOvertimeHours: 0,
    dayOvertimeHours: 0,
    nightOvertimeHours: 0,
    dayMultiplier: 1.35,
    nightMultiplier: 1.70,
    effectivePaidHours: 0,
    dayOvertimePay: 0,
    nightOvertimePay: 0,
    totalOvertimePay: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    suggestedStatus: 'غياب',
    explanationSteps: [message],
  });

  const parsedIn = parseTimeToMinutes(checkIn);
  const parsedOut = parseTimeToMinutes(checkOut);

  if (parsedIn === null || parsedOut === null) {
    return empty('وقت الحضور أو الانصراف غير صالح. يرجى إدخاله بصيغة 24 ساعة (مثال: 08:00).');
  }

  // Align times on a common timeline that may cross midnight.
  let inMins = parsedIn;
  let outMins = parsedOut;

  if (shiftType === 'NIGHT_SHIFT' && inMins < 12 * 60) {
    // A night-shift arrival after midnight belongs to the previous evening.
    inMins += 24 * 60;
  }
  while (outMins < inMins) {
    outMins += 24 * 60;
  }

  const totalWorkedMins = outMins - inMins;
  const actualWorkedHours = roundHours(totalWorkedMins);

  // Late arrival / early departure (never negative, never NaN).
  const lateMinutes = Math.max(0, inMins - shift.start);
  const earlyLeaveMinutes = Math.max(0, shift.end - outMins);

  steps.push(`الوردية المقررة: ${shift.label}`);
  steps.push(`تسجيل الحضور: ${formatMinutesToTime(parsedIn)} — الانصراف: ${formatMinutesToTime(parsedOut)}`);
  steps.push(`إجمالي ساعات العمل الفعلية: ${actualWorkedHours} ساعة (الأساسي ${shift.standardHours} ساعة)`);

  if (lateMinutes > 0) {
    steps.push(`تأخير عن موعد بدء الوردية: ${lateMinutes} دقيقة${lateMinutes > LATE_GRACE_MINUTES ? ' (يُحتسب تأخيراً)' : ' (داخل فترة السماح)'}.`);
  }
  if (earlyLeaveMinutes > 0 && totalWorkedMins > 0) {
    steps.push(`انصراف مبكر قبل نهاية الوردية: ${earlyLeaveMinutes} دقيقة${earlyLeaveMinutes > EARLY_LEAVE_GRACE_MINUTES ? ' (يُحتسب انصرافاً مبكراً)' : ' (داخل فترة السماح)'}.`);
  }

  let dayOTMins = 0;
  let nightOTMins = 0;

  if (outMins > shift.end) {
    const otStart = Math.max(shift.end, inMins);
    const otEnd = outMins;
    const split = splitOvertimeMinutes(otStart, otEnd);
    dayOTMins = split.day;
    nightOTMins = split.night;

    steps.push(`فترة العمل الإضافي: من ${formatMinutesToTime(otStart)} إلى ${formatMinutesToTime(otEnd)}`);
  } else if (totalWorkedMins > 0) {
    steps.push('لا يوجد عمل إضافي بعد موعد انتهاء الوردية المقررة.');
  }

  const dayOvertimeHours = roundHours(dayOTMins);
  const nightOvertimeHours = roundHours(nightOTMins);
  const totalOvertimeHours = roundHours(dayOTMins + nightOTMins);

  const dayMultiplier = 1.35;
  const nightMultiplier = 1.70;

  const dayOvertimePay = roundMoney(dayOvertimeHours * safeRate * dayMultiplier);
  const nightOvertimePay = roundMoney(nightOvertimeHours * safeRate * nightMultiplier);
  const totalOvertimePay = roundMoney(dayOvertimePay + nightOvertimePay);
  const effectivePaidHours = Number(
    (dayOvertimeHours * dayMultiplier + nightOvertimeHours * nightMultiplier).toFixed(2),
  );

  if (dayOvertimeHours > 0) {
    steps.push(
      `إضافي نهاري (06:00 - 18:00): ${dayOvertimeHours} ساعة × 1.35 = ${roundMoney(dayOvertimeHours * 1.35)} ساعة محتسبة (${dayOvertimePay} ج.م)`,
    );
  }
  if (nightOvertimeHours > 0) {
    steps.push(
      `إضافي ليلي (18:00 - 06:00): ${nightOvertimeHours} ساعة × 1.70 = ${roundMoney(nightOvertimeHours * 1.70)} ساعة محتسبة (${nightOvertimePay} ج.م)`,
    );
  }
  if (totalOvertimeHours > 0) {
    steps.push(
      `الإجمالي: ${totalOvertimeHours} ساعة إضافية (تعادل ${effectivePaidHours} ساعة مدفوعة بقيمة ${totalOvertimePay} ج.م).`,
    );
  }

  let suggestedStatus: AttendanceRecord['status'] = 'حاضر';
  if (totalWorkedMins === 0) {
    suggestedStatus = 'غياب';
  } else if (totalOvertimeHours > 0) {
    suggestedStatus = 'إضافي';
  } else if (lateMinutes > LATE_GRACE_MINUTES) {
    suggestedStatus = 'متأخر';
  } else if (earlyLeaveMinutes > EARLY_LEAVE_GRACE_MINUTES) {
    suggestedStatus = 'انصراف مبكر';
  }

  return {
    isValid: true,
    standardHours: shift.standardHours,
    actualWorkedHours,
    totalOvertimeHours,
    dayOvertimeHours,
    nightOvertimeHours,
    dayMultiplier,
    nightMultiplier,
    effectivePaidHours,
    dayOvertimePay,
    nightOvertimePay,
    totalOvertimePay,
    lateMinutes,
    earlyLeaveMinutes,
    suggestedStatus,
    explanationSteps: steps,
  };
}

/**
 * Returns Python source code representation of this exact algorithm
 * for company server deployment with FastAPI / PostgreSQL.
 */
export function getPythonOvertimeCode(): string {
  return `"""
SMD (Suez Methanol Derivatives Co.)
Overtime Calculation Algorithm Module

Business Rules:
- Shift End to 18:00 (6:00 PM): Day Overtime @ 1.35x
- 18:00 to 06:00 next day: Night Overtime @ 1.70x
"""
from datetime import datetime, time, timedelta

DAY_OT_RATE = 1.35
NIGHT_OT_RATE = 1.70
CUTOFF_EVENING = time(18, 0)  # 6:00 PM strict cutoff
CUTOFF_MORNING = time(6, 0)   # 6:00 AM morning boundary

SHIFTS = {
    "NORMAL_DAY": {"start": time(8, 0), "end": time(16, 0), "standard_hours": 8},
    "DAY_SHIFT":  {"start": time(8, 0), "end": time(20, 0), "standard_hours": 12},
    "NIGHT_SHIFT": {"start": time(20, 0), "end": time(8, 0), "standard_hours": 12, "crosses_midnight": True}
}

def calculate_employee_overtime(shift_type: str, check_in_dt: datetime, check_out_dt: datetime, hourly_rate: float = 85.0):
    shift = SHIFTS.get(shift_type, SHIFTS["NORMAL_DAY"])

    scheduled_end = datetime.combine(check_in_dt.date(), shift["end"])
    if shift.get("crosses_midnight") or shift["end"] <= shift["start"]:
        if check_out_dt < check_in_dt or scheduled_end <= check_in_dt:
            scheduled_end += timedelta(days=1)

    if check_out_dt <= scheduled_end:
        return {
            "total_overtime_hours": 0.0,
            "day_ot_hours": 0.0,
            "night_ot_hours": 0.0,
            "total_overtime_pay": 0.0,
            "effective_paid_hours": 0.0
        }

    ot_start = scheduled_end
    ot_end = check_out_dt

    day_ot_minutes = 0
    night_ot_minutes = 0

    curr = ot_start
    while curr < ot_end:
        t = curr.time()
        if CUTOFF_MORNING <= t < CUTOFF_EVENING:
            day_ot_minutes += 1
        else:
            night_ot_minutes += 1
        curr += timedelta(minutes=1)

    day_hours = round(day_ot_minutes / 60.0, 2)
    night_hours = round(night_ot_minutes / 60.0, 2)
    total_ot_hours = round((day_ot_minutes + night_ot_minutes) / 60.0, 2)

    day_pay = round(day_hours * hourly_rate * DAY_OT_RATE, 2)
    night_pay = round(night_hours * hourly_rate * NIGHT_OT_RATE, 2)
    total_pay = round(day_pay + night_pay, 2)
    effective_paid_hours = round((day_hours * DAY_OT_RATE) + (night_hours * NIGHT_OT_RATE), 2)

    return {
        "shift_type": shift_type,
        "actual_worked_hours": round((check_out_dt - check_in_dt).total_seconds() / 3600.0, 2),
        "total_overtime_hours": total_ot_hours,
        "day_ot_hours": day_hours,
        "night_ot_hours": night_hours,
        "day_ot_rate": DAY_OT_RATE,
        "night_ot_rate": NIGHT_OT_RATE,
        "day_pay": day_pay,
        "night_pay": night_pay,
        "total_overtime_pay": total_pay,
        "effective_paid_hours": effective_paid_hours
    }
`;
}

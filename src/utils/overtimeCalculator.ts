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
 *   16:00 - 18:00 = 2 hours @ 1.35 = 2.70 standard paid hours
 *   18:00 - 20:00 = 2 hours @ 1.70 = 3.40 standard paid hours
 *   Total = 4 hours overtime (Value = (2 * 1.35 + 2 * 1.70) * hourlyRate)
 * 
 * - Night Shift ends at 00:00 midnight, extends to 02:00 AM:
 *   00:00 - 02:00 = 2 hours @ 1.70 = 3.40 standard paid hours
 */

import { ShiftType } from '../types';

export interface OvertimeBreakdown {
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
  explanationSteps: string[];
}

/**
 * Converts "HH:mm" time string into minutes from start of reference day (0 to 1439).
 * If crosses midnight, handles day rollover offset (+1440).
 */
export function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function formatMinutesToTime(mins: number): string {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function calculateOvertime(
  shiftType: ShiftType,
  checkIn: string,
  checkOut: string,
  hourlyRate: number = 85.0
): OvertimeBreakdown {
  const steps: string[] = [];

  // Define shift schedule in minutes
  let shiftStartMins: number;
  let shiftEndMins: number;
  let standardHours: number;

  switch (shiftType) {
    case 'NORMAL_DAY':
      shiftStartMins = 8 * 60;  // 08:00 (480)
      shiftEndMins = 16 * 60;   // 16:00 (960)
      standardHours = 8;
      break;
    case 'DAY_SHIFT':
      shiftStartMins = 8 * 60;  // 08:00 (480)
      shiftEndMins = 20 * 60;   // 20:00 (1200)
      standardHours = 12;
      break;
    case 'NIGHT_SHIFT':
      shiftStartMins = 20 * 60; // 20:00 (1200)
      shiftEndMins = 32 * 60;   // 08:00 next day (1200 + 720 = 1920)
      standardHours = 12;
      break;
  }

  // Parse check in and check out
  let inMins = parseTimeToMinutes(checkIn);
  let outMins = parseTimeToMinutes(checkOut);

  // If checkout is numerically less than checkin, or night shift, it rolled over past midnight
  if (shiftType === 'NIGHT_SHIFT') {
    if (inMins < 12 * 60) inMins += 24 * 60;
    if (outMins < inMins) outMins += 24 * 60;
  } else if (outMins < inMins) {
    outMins += 24 * 60;
  }

  const totalWorkedMins = Math.max(0, outMins - inMins);
  const actualWorkedHours = Number((totalWorkedMins / 60).toFixed(2));

  // Determine post-shift overtime range
  // Overtime occurs when employee leaves after shiftEndMins
  let dayOTMins = 0;
  let nightOTMins = 0;

  if (outMins > shiftEndMins) {
    // Start of overtime is shiftEndMins (or inMins if they came after shift end, which is rare)
    const otStart = Math.max(shiftEndMins, inMins);
    const otEnd = outMins;

    steps.push(`الوردية المقررة: ${shiftType === 'NORMAL_DAY' ? 'يوم عمل عادي (08:00 - 16:00)' : shiftType === 'DAY_SHIFT' ? 'وردية نهارية (08:00 - 20:00)' : 'وردية ليلية (20:00 - 08:00)'}`);
    steps.push(`تسجيل الانصراف الفعلي: ${checkOut} (إجمالي العمل: ${actualWorkedHours} ساعة)`);
    steps.push(`فترة العمل الإضافي المحسوبة: من ${formatMinutesToTime(otStart)} إلى ${formatMinutesToTime(otEnd)}`);

    // We slice minute by minute or in intervals using the 18:00 (6:00 PM) cutoff
    // 06:00 to 18:00 = DAY (1.35)
    // 18:00 to 06:00 = NIGHT (1.70)
    for (let m = otStart; m < otEnd; m++) {
      const clockMinute = m % 1440; // 0 to 1439 in standard 24h day
      // 06:00 is 360 mins, 18:00 is 1080 mins
      if (clockMinute >= 360 && clockMinute < 1080) {
        dayOTMins++;
      } else {
        nightOTMins++;
      }
    }
  } else {
    steps.push('لا يوجد عمل إضافي بعد موعد انتهاء الوردية المقررة.');
  }

  const dayOvertimeHours = Number((dayOTMins / 60).toFixed(2));
  const nightOvertimeHours = Number((nightOTMins / 60).toFixed(2));
  const totalOvertimeHours = Number(((dayOTMins + nightOTMins) / 60).toFixed(2));

  const dayMultiplier = 1.35;
  const nightMultiplier = 1.70;

  const dayOvertimePay = Number((dayOvertimeHours * hourlyRate * dayMultiplier).toFixed(2));
  const nightOvertimePay = Number((nightOvertimeHours * hourlyRate * nightMultiplier).toFixed(2));
  const totalOvertimePay = Number((dayOvertimePay + nightOvertimePay).toFixed(2));
  const effectivePaidHours = Number((dayOvertimeHours * dayMultiplier + nightOvertimeHours * nightMultiplier).toFixed(2));

  if (dayOvertimeHours > 0) {
    steps.push(`ساعات إضافي نهاري (قبل 6:00 م): ${dayOvertimeHours} ساعة × 1.35 = ${(dayOvertimeHours * 1.35).toFixed(2)} ساعة محسوبة (${dayOvertimePay} ج.م)`);
  }
  if (nightOvertimeHours > 0) {
    steps.push(`ساعات إضافي ليلي (بعد 6:00 م حتى 6:00 ص): ${nightOvertimeHours} ساعة × 1.70 = ${(nightOvertimeHours * 1.70).toFixed(2)} ساعة محسوبة (${nightOvertimePay} ج.م)`);
  }
  if (totalOvertimeHours > 0) {
    steps.push(`إجمالي الساعات الإضافية الفعلية: ${totalOvertimeHours} ساعة (تعادل ${effectivePaidHours} ساعة مدفوعة بقيمة إجمالية ${totalOvertimePay} ج.م)`);
  }

  return {
    standardHours,
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
    explanationSteps: steps
  };
}

/**
 * Returns Python source code representation of this exact algorithm
 * for company server deployment with FastAPI / SQLite / PostgreSQL.
 */
export function getPythonOvertimeCode(): string {
  return `"""
SMD (Suez Methanol Derivatives Co.)
Overtime Calculation Algorithm Module
Author: SMD Senior Full-Stack & Database Architect

Business Rules:
- Shift End to 18:00 (6:00 PM): Day Overtime @ 1.35x
- 18:00 to 06:00 next day: Night Overtime @ 1.70x
"""
from datetime import datetime, time, timedelta

DAY_OT_RATE = 1.35
NIGHT_OT_RATE = 1.70
CUTOFF_EVENING = time(18, 0) # 6:00 PM strict cutoff
CUTOFF_MORNING = time(6, 0)  # 6:00 AM morning boundary

SHIFTS = {
    "NORMAL_DAY": {"start": time(8, 0), "end": time(16, 0), "standard_hours": 8},
    "DAY_SHIFT":  {"start": time(8, 0), "end": time(20, 0), "standard_hours": 12},
    "NIGHT_SHIFT": {"start": time(20, 0), "end": time(8, 0), "standard_hours": 12, "crosses_midnight": True}
}

def calculate_employee_overtime(shift_type: str, check_in_dt: datetime, check_out_dt: datetime, hourly_rate: float = 85.0):
    shift = SHIFTS.get(shift_type, SHIFTS["NORMAL_DAY"])
    
    # Base scheduled end datetime
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
        # Between 06:00 and 18:00 is DAY
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

/**
 * SMD - Suez Methanol Derivatives Co.
 * Core Overtime Calculation Engine (Phase B: settings-driven)
 *
 * Business Rules (read from `work_settings`, not from literals):
 * 1. Shifts:
 *    - NORMAL_DAY: 08:00 -> 16:00 (8 Hours)
 *    - DAY_SHIFT:  08:00 -> 20:00 (12 Hours)
 *    - NIGHT_SHIFT: 20:00 -> 08:00 next morning (12 Hours)
 * 2. Overtime day bracket: 06:00 -> 18:00 (6:00 PM cutoff)
 * 3. Overtime rates:
 *    - Day bracket: Hourly Rate * 1.35
 *    - Night bracket: Hourly Rate * 1.70
 *
 * The approved values above are only the fallback defaults. The live values
 * are loaded from `GET /api/settings/work` by `useWorkSettingsBootstrap` and
 * applied with `configureOvertimeSettings`, so HR edits change the engine
 * without touching code. The public API of `calculateOvertime` is unchanged.
 *
 * The engine never returns NaN. Invalid times are reported explicitly so the
 * UI can ask the user to correct the input instead of storing corrupt payroll.
 */

import { AttendanceRecord, ShiftType, WorkSettings } from '../types';
import { normalizeTime } from './dateUtils';

/** Minutes of grace before an arrival counts as "late" (fallback only). */
export const LATE_GRACE_MINUTES = 15;
/** Minutes of grace before a departure counts as "early leave". */
export const EARLY_LEAVE_GRACE_MINUTES = 15;

/** Values the engine needs, all editable from the HR settings screen. */
export interface OvertimeSettings {
  normalStart: string;
  normalEnd: string;
  dayStart: string;
  dayEnd: string;
  nightStart: string;
  nightEnd: string;
  overtimeDayStart: string;
  overtimeCutoff: string;
  overtimeDayMultiplier: number;
  overtimeNightMultiplier: number;
  lateGraceMinutes: number;
}

/** Approved defaults from AGENTS.md; changing them needs written HR approval. */
export const DEFAULT_OVERTIME_SETTINGS: OvertimeSettings = Object.freeze({
  normalStart: '08:00',
  normalEnd: '16:00',
  dayStart: '08:00',
  dayEnd: '20:00',
  nightStart: '20:00',
  nightEnd: '08:00',
  overtimeDayStart: '06:00',
  overtimeCutoff: '18:00',
  overtimeDayMultiplier: 1.35,
  overtimeNightMultiplier: 1.7,
  lateGraceMinutes: 15,
});

export function overtimeSettingsFromWorkSettings(settings: WorkSettings): OvertimeSettings {
  return {
    normalStart: settings.normalStart,
    normalEnd: settings.normalEnd,
    dayStart: settings.dayStart,
    dayEnd: settings.dayEnd,
    nightStart: settings.nightStart,
    nightEnd: settings.nightEnd,
    overtimeDayStart: settings.overtimeDayStart,
    overtimeCutoff: settings.overtimeCutoff,
    overtimeDayMultiplier: settings.overtimeDayMultiplier,
    overtimeNightMultiplier: settings.overtimeNightMultiplier,
    lateGraceMinutes: settings.lateGraceMinutes,
  };
}

function safeTime(value: string | undefined, fallback: string): string {
  return normalizeTime(value) ?? fallback;
}

function safeMultiplier(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeGrace(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}

function sanitizeSettings(input: Partial<OvertimeSettings>): OvertimeSettings {
  const merged = { ...DEFAULT_OVERTIME_SETTINGS, ...input };

  let normalStart = safeTime(merged.normalStart, DEFAULT_OVERTIME_SETTINGS.normalStart);
  let normalEnd = safeTime(merged.normalEnd, DEFAULT_OVERTIME_SETTINGS.normalEnd);
  if (normalStart === normalEnd) {
    normalStart = DEFAULT_OVERTIME_SETTINGS.normalStart;
    normalEnd = DEFAULT_OVERTIME_SETTINGS.normalEnd;
  }

  let dayStart = safeTime(merged.dayStart, DEFAULT_OVERTIME_SETTINGS.dayStart);
  let dayEnd = safeTime(merged.dayEnd, DEFAULT_OVERTIME_SETTINGS.dayEnd);
  if (dayStart === dayEnd) {
    dayStart = DEFAULT_OVERTIME_SETTINGS.dayStart;
    dayEnd = DEFAULT_OVERTIME_SETTINGS.dayEnd;
  }

  let nightStart = safeTime(merged.nightStart, DEFAULT_OVERTIME_SETTINGS.nightStart);
  let nightEnd = safeTime(merged.nightEnd, DEFAULT_OVERTIME_SETTINGS.nightEnd);
  if (nightStart === nightEnd) {
    nightStart = DEFAULT_OVERTIME_SETTINGS.nightStart;
    nightEnd = DEFAULT_OVERTIME_SETTINGS.nightEnd;
  }

  let overtimeDayStart = safeTime(
    merged.overtimeDayStart,
    DEFAULT_OVERTIME_SETTINGS.overtimeDayStart,
  );
  let overtimeCutoff = safeTime(
    merged.overtimeCutoff,
    DEFAULT_OVERTIME_SETTINGS.overtimeCutoff,
  );
  if (overtimeDayStart === overtimeCutoff) {
    overtimeDayStart = DEFAULT_OVERTIME_SETTINGS.overtimeDayStart;
    overtimeCutoff = DEFAULT_OVERTIME_SETTINGS.overtimeCutoff;
  }

  return {
    normalStart,
    normalEnd,
    dayStart,
    dayEnd,
    nightStart,
    nightEnd,
    overtimeDayStart,
    overtimeCutoff,
    overtimeDayMultiplier: safeMultiplier(
      merged.overtimeDayMultiplier,
      DEFAULT_OVERTIME_SETTINGS.overtimeDayMultiplier,
    ),
    overtimeNightMultiplier: safeMultiplier(
      merged.overtimeNightMultiplier,
      DEFAULT_OVERTIME_SETTINGS.overtimeNightMultiplier,
    ),
    lateGraceMinutes: safeGrace(
      merged.lateGraceMinutes,
      DEFAULT_OVERTIME_SETTINGS.lateGraceMinutes,
    ),
  };
}

let activeSettings: OvertimeSettings = DEFAULT_OVERTIME_SETTINGS;
const settingsListeners = new Set<() => void>();

/** Current settings; stable reference until the next configure/reset. */
export function getOvertimeSettings(): OvertimeSettings {
  return activeSettings;
}

/** Subscribe for React `useSyncExternalStore` consumers. */
export function subscribeOvertimeSettings(listener: () => void): () => void {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}

function notifySettingsChanged(): void {
  settingsListeners.forEach((listener) => listener());
}

/** Apply values fetched from `/api/settings/work` (invalid values fall back). */
export function configureOvertimeSettings(input: Partial<OvertimeSettings>): OvertimeSettings {
  activeSettings = sanitizeSettings(input);
  notifySettingsChanged();
  return activeSettings;
}

/** Restore the approved defaults (demo mode, logout, or test isolation). */
export function resetOvertimeSettings(): OvertimeSettings {
  activeSettings = DEFAULT_OVERTIME_SETTINGS;
  notifySettingsChanged();
  return activeSettings;
}

export interface OvertimeBreakdown {
  /** False when check-in/check-out cannot be parsed; all numeric fields are 0. */
  isValid: boolean;
  standardHours: number;
  actualWorkedHours: number;
  totalOvertimeHours: number;
  dayOvertimeHours: number;    // Hours in the day bracket (06:00 -> 18:00)
  nightOvertimeHours: number;  // Hours in the night bracket (18:00 -> 06:00)
  dayMultiplier: number;       // from work_settings
  nightMultiplier: number;     // from work_settings
  effectivePaidHours: number;  // dayOT * multiplier + nightOT * multiplier
  dayOvertimePay: number;
  nightOvertimePay: number;
  totalOvertimePay: number;
  lateMinutes: number;         // Arrival after the scheduled shift start
  earlyLeaveMinutes: number;   // Departure before the scheduled shift end
  suggestedStatus: AttendanceRecord['status'];
  explanationSteps: string[];
}

interface ShiftConfig {
  start: number;
  end: number;
  standardHours: number;
  label: string;
}

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

function absoluteEnd(start: number, end: number): number {
  return end > start ? end : end + 24 * 60;
}

function buildShiftConfig(settings: OvertimeSettings): Record<ShiftType, ShiftConfig> {
  const normalStart = parseTimeToMinutes(settings.normalStart) ?? 8 * 60;
  const normalEnd = absoluteEnd(
    normalStart,
    parseTimeToMinutes(settings.normalEnd) ?? 16 * 60,
  );
  const dayStart = parseTimeToMinutes(settings.dayStart) ?? 8 * 60;
  const dayEnd = absoluteEnd(dayStart, parseTimeToMinutes(settings.dayEnd) ?? 20 * 60);
  const nightStart = parseTimeToMinutes(settings.nightStart) ?? 20 * 60;
  const nightEnd = absoluteEnd(
    nightStart,
    parseTimeToMinutes(settings.nightEnd) ?? 8 * 60,
  );

  return {
    NORMAL_DAY: {
      start: normalStart,
      end: normalEnd,
      standardHours: roundHours(normalEnd - normalStart),
      label: `يوم عمل عادي (${formatMinutesToTime(normalStart)} - ${formatMinutesToTime(normalEnd)})`,
    },
    DAY_SHIFT: {
      start: dayStart,
      end: dayEnd,
      standardHours: roundHours(dayEnd - dayStart),
      label: `وردية نهارية (${formatMinutesToTime(dayStart)} - ${formatMinutesToTime(dayEnd)})`,
    },
    NIGHT_SHIFT: {
      start: nightStart,
      end: nightEnd,
      standardHours: roundHours(nightEnd - nightStart),
      label: `وردية ليلية (${formatMinutesToTime(nightStart)} - ${formatMinutesToTime(nightEnd)})`,
    },
  };
}

/** Splits an overtime interval using the configured day bracket. */
export function splitOvertimeMinutes(
  startMins: number,
  endMins: number,
  settings: OvertimeSettings = activeSettings,
): { day: number; night: number } {
  const dayStart = parseTimeToMinutes(settings.overtimeDayStart) ?? 6 * 60;
  const cutoff = parseTimeToMinutes(settings.overtimeCutoff) ?? 18 * 60;
  const isNormalWindow = dayStart < cutoff;
  const isEqual = dayStart === cutoff;

  let day = 0;
  let night = 0;
  const safeStart = Math.max(0, Math.floor(startMins));
  const safeEnd = Math.max(safeStart, Math.floor(endMins));
  // Guard against absurd input (more than 7 days).
  const cappedEnd = Math.min(safeEnd, safeStart + 7 * 24 * 60);
  for (let m = safeStart; m < cappedEnd; m += 1) {
    const clockMinute = m % 1440;
    const inDayBracket = isEqual
      ? false
      : isNormalWindow
        ? clockMinute >= dayStart && clockMinute < cutoff
        : clockMinute >= dayStart || clockMinute < cutoff;
    if (inDayBracket) {
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
  const settings = activeSettings;
  const shiftConfig = buildShiftConfig(settings);
  const shift = shiftConfig[shiftType] ?? shiftConfig.NORMAL_DAY;
  const safeRate = Number.isFinite(hourlyRate) && hourlyRate > 0 ? hourlyRate : 0;
  const steps: string[] = [];

  const empty = (message: string): OvertimeBreakdown => ({
    isValid: false,
    standardHours: shift.standardHours,
    actualWorkedHours: 0,
    totalOvertimeHours: 0,
    dayOvertimeHours: 0,
    nightOvertimeHours: 0,
    dayMultiplier: settings.overtimeDayMultiplier,
    nightMultiplier: settings.overtimeNightMultiplier,
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
    steps.push(
      `تأخير عن موعد بدء الوردية: ${lateMinutes} دقيقة${
        lateMinutes > settings.lateGraceMinutes ? ' (يُحتسب تأخيراً)' : ' (داخل فترة السماح)'
      }.`,
    );
  }
  if (earlyLeaveMinutes > 0 && totalWorkedMins > 0) {
    steps.push(
      `انصراف مبكر قبل نهاية الوردية: ${earlyLeaveMinutes} دقيقة${
        earlyLeaveMinutes > EARLY_LEAVE_GRACE_MINUTES ? ' (يُحتسب انصرافاً مبكراً)' : ' (داخل فترة السماح)'
      }.`,
    );
  }

  let dayOTMins = 0;
  let nightOTMins = 0;

  if (outMins > shift.end) {
    const otStart = Math.max(shift.end, inMins);
    const otEnd = outMins;
    const split = splitOvertimeMinutes(otStart, otEnd, settings);
    dayOTMins = split.day;
    nightOTMins = split.night;

    steps.push(`فترة العمل الإضافي: من ${formatMinutesToTime(otStart)} إلى ${formatMinutesToTime(otEnd)}`);
  } else if (totalWorkedMins > 0) {
    steps.push('لا يوجد عمل إضافي بعد موعد انتهاء الوردية المقررة.');
  }

  const dayOvertimeHours = roundHours(dayOTMins);
  const nightOvertimeHours = roundHours(nightOTMins);
  const totalOvertimeHours = roundHours(dayOTMins + nightOTMins);

  const dayMultiplier = settings.overtimeDayMultiplier;
  const nightMultiplier = settings.overtimeNightMultiplier;

  const dayOvertimePay = roundMoney(dayOvertimeHours * safeRate * dayMultiplier);
  const nightOvertimePay = roundMoney(nightOvertimeHours * safeRate * nightMultiplier);
  const totalOvertimePay = roundMoney(dayOvertimePay + nightOvertimePay);
  const effectivePaidHours = Number(
    (dayOvertimeHours * dayMultiplier + nightOvertimeHours * nightMultiplier).toFixed(2),
  );

  if (dayOvertimeHours > 0) {
    steps.push(
      `إضافي نهاري (${settings.overtimeDayStart} - ${settings.overtimeCutoff}): ${dayOvertimeHours} ساعة × ${dayMultiplier} = ${roundMoney(dayOvertimeHours * dayMultiplier)} ساعة محتسبة (${dayOvertimePay} ج.م)`,
    );
  }
  if (nightOvertimeHours > 0) {
    steps.push(
      `إضافي ليلي (${settings.overtimeCutoff} - ${settings.overtimeDayStart}): ${nightOvertimeHours} ساعة × ${nightMultiplier} = ${roundMoney(nightOvertimeHours * nightMultiplier)} ساعة محتسبة (${nightOvertimePay} ج.م)`,
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
  } else if (lateMinutes > settings.lateGraceMinutes) {
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

function pythonTime(value: string): string {
  const minutes = parseTimeToMinutes(value) ?? 0;
  return `time(${Math.floor(minutes / 60)}, ${minutes % 60})`;
}

/**
 * Returns Python source code representation of this exact algorithm
 * for company server deployment with FastAPI / PostgreSQL.
 * The current settings are interpolated so the displayed code is not stale.
 */
export function getPythonOvertimeCode(settings: OvertimeSettings = activeSettings): string {
  const shifts = buildShiftConfig(settings);
  return `"""
SMD (Suez Methanol Derivatives Co.)
Overtime Calculation Algorithm Module

Business Rules:
- Shift End to ${settings.overtimeCutoff} (6:00 PM): Day Overtime @ ${settings.overtimeDayMultiplier}x
- ${settings.overtimeCutoff} to ${settings.overtimeDayStart} next day: Night Overtime @ ${settings.overtimeNightMultiplier}x
"""
from datetime import datetime, time, timedelta

DAY_OT_RATE = ${settings.overtimeDayMultiplier}
NIGHT_OT_RATE = ${settings.overtimeNightMultiplier}
CUTOFF_EVENING = ${pythonTime(settings.overtimeCutoff)}  # 6:00 PM strict cutoff
CUTOFF_MORNING = ${pythonTime(settings.overtimeDayStart)}   # 6:00 AM morning boundary

SHIFTS = {
    "NORMAL_DAY": {"start": ${pythonTime(settings.normalStart)}, "end": ${pythonTime(settings.normalEnd)}, "standard_hours": ${shifts.NORMAL_DAY.standardHours}},
    "DAY_SHIFT":  {"start": ${pythonTime(settings.dayStart)}, "end": ${pythonTime(settings.dayEnd)}, "standard_hours": ${shifts.DAY_SHIFT.standardHours}},
    "NIGHT_SHIFT": {"start": ${pythonTime(settings.nightStart)}, "end": ${pythonTime(settings.nightEnd)}, "standard_hours": ${shifts.NIGHT_SHIFT.standardHours}, "crosses_midnight": True}
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

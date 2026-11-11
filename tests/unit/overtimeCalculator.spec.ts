import {describe, expect, it} from 'vitest';
import {calculateOvertime, formatMinutesToTime, parseTimeToMinutes} from '../../src/utils/overtimeCalculator';

/**
 * Golden HR cases for the 6:00 PM overtime cutoff.
 * These values are the contract with HR: changing them requires sign-off.
 */
describe('overtime engine — golden cases', () => {
  it('normal day 08:00 → 20:00 = 2h day (1.35) + 2h night (1.70)', () => {
    const result = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 150);

    expect(result.isValid).toBe(true);
    expect(result.totalOvertimeHours).toBe(4);
    expect(result.dayOvertimeHours).toBe(2);
    expect(result.nightOvertimeHours).toBe(2);
    expect(result.dayOvertimePay).toBe(405);
    expect(result.nightOvertimePay).toBe(510);
    expect(result.totalOvertimePay).toBe(915);
    expect(result.effectivePaidHours).toBe(6.1);
  });

  it('normal day 07:55 → 20:00 keeps the 4h overtime and no late penalty', () => {
    const result = calculateOvertime('NORMAL_DAY', '07:55', '20:00', 150);

    expect(result.totalOvertimeHours).toBe(4);
    expect(result.dayOvertimeHours).toBe(2);
    expect(result.nightOvertimeHours).toBe(2);
    expect(result.lateMinutes).toBe(0);
    expect(result.suggestedStatus).toBe('إضافي');
  });

  it('day shift 07:45 → 21:30 = 1.5h night overtime only', () => {
    const result = calculateOvertime('DAY_SHIFT', '07:45', '21:30', 95);

    expect(result.dayOvertimeHours).toBe(0);
    expect(result.nightOvertimeHours).toBe(1.5);
    expect(result.totalOvertimePay).toBe(242.25);
  });

  it('night shift 19:50 → 09:00 = 1h day overtime after 08:00', () => {
    const result = calculateOvertime('NIGHT_SHIFT', '19:50', '09:00', 85);

    expect(result.actualWorkedHours).toBe(13.17);
    expect(result.dayOvertimeHours).toBe(1);
    expect(result.nightOvertimeHours).toBe(0);
    expect(result.totalOvertimePay).toBe(114.75);
  });

  it('night shift 20:00 → 02:00 = no overtime but early leave is reported', () => {
    const result = calculateOvertime('NIGHT_SHIFT', '20:00', '02:00', 85);

    expect(result.totalOvertimeHours).toBe(0);
    expect(result.actualWorkedHours).toBe(6);
    expect(result.earlyLeaveMinutes).toBe(360);
    expect(result.earlyLeaveMinutes).toBeGreaterThan(15);
    expect(result.suggestedStatus).toBe('انصراف مبكر');
  });

  it('late arrival after the 15-minute grace period is flagged', () => {
    const result = calculateOvertime('NORMAL_DAY', '08:20', '16:00', 85);

    expect(result.lateMinutes).toBe(20);
    expect(result.suggestedStatus).toBe('متأخر');
  });

  it('2 minutes late stays "present" thanks to the grace period', () => {
    const result = calculateOvertime('NORMAL_DAY', '08:02', '16:00', 85);

    expect(result.lateMinutes).toBe(2);
    expect(result.suggestedStatus).toBe('حاضر');
  });
});

describe('overtime engine — input hardening', () => {
  it('never returns NaN for invalid times', () => {
    const result = calculateOvertime('NORMAL_DAY', 'abc', '20:00', 150);

    expect(result.isValid).toBe(false);
    expect(Number.isNaN(result.totalOvertimePay)).toBe(false);
    expect(result.totalOvertimeHours).toBe(0);
    expect(result.explanationSteps[0]).toContain('غير صالح');
  });

  it('never returns NaN for an invalid hourly rate', () => {
    const result = calculateOvertime('NORMAL_DAY', '08:00', '20:00', Number.NaN);

    expect(result.totalOvertimePay).toBe(0);
    expect(result.actualWorkedHours).toBe(12);
  });

  it('accepts single-digit hours and seconds ("8:00:00")', () => {
    expect(parseTimeToMinutes('8:00')).toBe(480);
    expect(parseTimeToMinutes('08:00:00')).toBe(480);
    expect(parseTimeToMinutes('25:00')).toBeNull();
  });

  it('formats minutes past midnight correctly', () => {
    expect(formatMinutesToTime(1920)).toBe('08:00');
    expect(formatMinutesToTime(1560)).toBe('02:00');
  });
});

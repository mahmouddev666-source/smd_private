import {describe, expect, it} from 'vitest';
import {
  addDaysISO,
  dateRangeISO,
  daysAgoISO,
  firstDayOfMonth,
  formatArabicDate,
  isFriday,
  isValidISODate,
  localDateISO,
  localTimestamp,
  monthKey,
  normalizeTime,
} from '../../src/utils/dateUtils';

describe('dateUtils — Cairo business dates', () => {
  it('uses Africa/Cairo, not UTC, around midnight', () => {
    // 22:30 UTC on 10 Nov 2026 is 00:30 on 11 Nov in Cairo (UTC+2).
    const utcEvening = new Date('2026-11-10T22:30:00Z');
    expect(localDateISO(utcEvening)).toBe('2026-11-11');
  });

  it('formats a Cairo timestamp', () => {
    expect(localTimestamp(new Date('2026-11-10T08:05:09Z'))).toBe('2026-11-10 10:05:09');
  });

  it('adds and subtracts calendar days without timezone drift', () => {
    expect(addDaysISO('2026-11-10', 1)).toBe('2026-11-11');
    expect(addDaysISO('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('computes days ago from the Cairo today', () => {
    const today = localDateISO();
    expect(daysAgoISO(0)).toBe(today);
    expect(daysAgoISO(1)).toBe(addDaysISO(today, -1));
  });

  it('builds inclusive date ranges and rejects invalid dates', () => {
    expect(dateRangeISO('2026-11-08', '2026-11-10')).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
    ]);
    expect(dateRangeISO('2026-02-30', '2026-03-02')).toEqual([]);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
  });

  it('normalizes user-entered times', () => {
    expect(normalizeTime('8:5')).toBe('08:05');
    expect(normalizeTime('08:00:00')).toBe('08:00');
    expect(normalizeTime('٠٨:٣٠')).toBe('08:30');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('')).toBeNull();
  });

  it('detects Fridays and month keys', () => {
    expect(isFriday('2026-11-13')).toBe(true);
    expect(isFriday('2026-11-10')).toBe(false);
    expect(monthKey('2026-11-10')).toBe('2026-11');
    expect(firstDayOfMonth(new Date('2026-11-10T12:00:00Z'))).toBe('2026-11-01');
  });

  it('formats Arabic dates without throwing', () => {
    expect(formatArabicDate('2026-11-10')).toContain('2026');
  });
});

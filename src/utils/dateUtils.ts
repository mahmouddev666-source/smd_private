/**
 * SMD - Suez Methanol Derivatives Co.
 * Date & time helpers.
 *
 * All business dates in SMD-HR are local dates in Africa/Cairo.
 * Never use `new Date().toISOString().split('T')[0]` for a business date:
 * it returns the UTC date and can be one day behind in Egypt.
 */

export const SMD_TIMEZONE = 'Africa/Cairo';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: SMD_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: SMD_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const ARABIC_DATE_FORMATTER = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: SMD_TIMEZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const ARABIC_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: SMD_TIMEZONE,
  weekday: 'long',
});

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns the current date in Africa/Cairo as `YYYY-MM-DD`. */
export function localDateISO(date: Date = new Date()): string {
  return DATE_FORMATTER.format(date);
}

/** Returns the current time in Africa/Cairo as `HH:mm:ss`. */
export function localTimeString(date: Date = new Date()): string {
  const formatted = TIME_FORMATTER.format(date);
  // Some ICU versions return "24:00:00" for midnight.
  return formatted.replace(/^24:/, '00:');
}

/** Returns `YYYY-MM-DD HH:mm:ss` in Africa/Cairo. */
export function localTimestamp(date: Date = new Date()): string {
  return `${localDateISO(date)} ${localTimeString(date)}`;
}

/** Adds a number of calendar days to an ISO date (`YYYY-MM-DD`). */
export function addDaysISO(isoDate: string, days: number): string {
  const parsed = parseISODate(isoDate);
  if (!parsed) return isoDate;
  const utc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  return new Date(utc + days * 86_400_000).toISOString().slice(0, 10);
}

/** Returns an ISO date `days` days ago (0 = today) in Africa/Cairo. */
export function daysAgoISO(days: number, from: Date = new Date()): string {
  return addDaysISO(localDateISO(from), -days);
}

/** Inclusive list of ISO dates between two dates. */
export function dateRangeISO(startISO: string, endISO: string): string[] {
  if (!parseISODate(startISO) || !parseISODate(endISO)) return [];
  const result: string[] = [];
  let cursor = startISO;
  let guard = 0;
  while (cursor <= endISO && guard < 3700) {
    result.push(cursor);
    cursor = addDaysISO(cursor, 1);
    guard += 1;
  }
  return result;
}

function parseISODate(iso: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function isValidISODate(value: string | null | undefined): boolean {
  return typeof value === 'string' && parseISODate(value) !== null;
}

/** Normalizes `8:00`, `08:00`, `08:00:00` and Arabic-Indic digits to `HH:mm`. */
export function normalizeTime(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalizedDigits = value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
  const match = /^(\d{1,2})[:.](\d{1,2})(?:[:.]\d{1,2})?$/.exec(normalizedDigits);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isValidTime(value: string | null | undefined): boolean {
  return normalizeTime(value) !== null;
}

/** Formats an ISO date for the Arabic UI, e.g. `10 نوفمبر 2026`. */
export function formatArabicDate(isoDate: string): string {
  const parsed = parseISODate(isoDate);
  if (!parsed) return isoDate;
  return ARABIC_DATE_FORMATTER.format(
    new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0)),
  );
}

/** Arabic weekday name for an ISO date. */
export function formatArabicWeekday(isoDate: string): string {
  const parsed = parseISODate(isoDate);
  if (!parsed) return '';
  return ARABIC_WEEKDAY_FORMATTER.format(
    new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0)),
  );
}

/** True when the ISO date is a Friday (Egyptian weekend). */
export function isFriday(isoDate: string): boolean {
  const parsed = parseISODate(isoDate);
  if (!parsed) return false;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay() === 5;
}

/** `YYYY-MM` for an ISO date, used for monthly filters. */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** First day of the current Cairo month as `YYYY-MM-DD`. */
export function firstDayOfMonth(date: Date = new Date()): string {
  return `${localDateISO(date).slice(0, 8)}01`;
}

/** Human readable relative label in Arabic. */
export function relativeDayLabel(isoDate: string): string {
  const today = localDateISO();
  if (isoDate === today) return 'اليوم';
  if (isoDate === addDaysISO(today, -1)) return 'أمس';
  return formatArabicDate(isoDate);
}

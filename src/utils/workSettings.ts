/**
 * SMD - Suez Methanol Derivatives Co.
 * Client-side validation for the HR/Admin work-settings screen.
 *
 * These checks mirror the Pydantic contract in `apps/api/app/schemas/settings.py`
 * so the form can show inline errors. The API still performs the real
 * validation, permission check and audit logging.
 */

import { WorkSettings, WorkSettingsPatch } from '../types';

export interface WorkSettingsForm {
  timezone: string;
  normalStart: string;
  normalEnd: string;
  dayStart: string;
  dayEnd: string;
  nightStart: string;
  nightEnd: string;
  overtimeDayStart: string;
  overtimeCutoff: string;
  overtimeDayMultiplier: string;
  overtimeNightMultiplier: string;
  lateGraceMinutes: string;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_FIELDS: (keyof WorkSettingsForm)[] = [
  'normalStart',
  'normalEnd',
  'dayStart',
  'dayEnd',
  'nightStart',
  'nightEnd',
  'overtimeDayStart',
  'overtimeCutoff',
];

export function formFromWorkSettings(settings: WorkSettings): WorkSettingsForm {
  return {
    timezone: settings.timezone,
    normalStart: settings.normalStart,
    normalEnd: settings.normalEnd,
    dayStart: settings.dayStart,
    dayEnd: settings.dayEnd,
    nightStart: settings.nightStart,
    nightEnd: settings.nightEnd,
    overtimeDayStart: settings.overtimeDayStart,
    overtimeCutoff: settings.overtimeCutoff,
    overtimeDayMultiplier: String(settings.overtimeDayMultiplier),
    overtimeNightMultiplier: String(settings.overtimeNightMultiplier),
    lateGraceMinutes: String(settings.lateGraceMinutes),
  };
}

export type WorkSettingsFormErrors = Partial<Record<keyof WorkSettingsForm, string>>;

export function validateWorkSettingsForm(form: WorkSettingsForm): WorkSettingsFormErrors {
  const errors: WorkSettingsFormErrors = {};

  if (!form.timezone.trim() || form.timezone.trim().length > 64) {
    errors.timezone = 'أدخل اسم المنطقة الزمنية (بحد أقصى 64 حرفًا).';
  }
  for (const key of TIME_FIELDS) {
    if (!TIME_PATTERN.test(form[key].trim())) {
      errors[key] = 'استخدم الصيغة HH:MM (مثال: 08:00).';
    }
  }
  for (const [start, end, label] of [
    ['normalStart', 'normalEnd', 'الوردية العادية'],
    ['dayStart', 'dayEnd', 'الوردية النهارية'],
    ['nightStart', 'nightEnd', 'الوردية الليلية'],
  ] as const) {
    if (form[start].trim() && form[start] === form[end]) {
      errors[end] = `وقت نهاية ${label} يجب أن يختلف عن بدايتها.`;
    }
  }

  for (const key of ['overtimeDayMultiplier', 'overtimeNightMultiplier'] as const) {
    const value = Number(form[key]);
    if (!Number.isFinite(value) || value <= 0 || value > 5) {
      errors[key] = 'المعامل يجب أن يكون أكبر من صفر ولا يتجاوز 5.';
    }
  }

  const grace = Number(form.lateGraceMinutes);
  if (!Number.isInteger(grace) || grace < 0 || grace > 120) {
    errors.lateGraceMinutes = 'دقائق السماح يجب أن تكون عددًا صحيحًا بين 0 و120.';
  }

  return errors;
}

/** Call only after `validateWorkSettingsForm` returns an empty object. */
export function toWorkSettingsPatch(
  form: WorkSettingsForm,
  expectedVersion: number,
): WorkSettingsPatch {
  return {
    timezone: form.timezone.trim(),
    normalStart: form.normalStart.trim(),
    normalEnd: form.normalEnd.trim(),
    dayStart: form.dayStart.trim(),
    dayEnd: form.dayEnd.trim(),
    nightStart: form.nightStart.trim(),
    nightEnd: form.nightEnd.trim(),
    overtimeDayStart: form.overtimeDayStart.trim(),
    overtimeCutoff: form.overtimeCutoff.trim(),
    overtimeDayMultiplier: Number(form.overtimeDayMultiplier),
    overtimeNightMultiplier: Number(form.overtimeNightMultiplier),
    lateGraceMinutes: Number(form.lateGraceMinutes),
    expectedVersion,
  };
}

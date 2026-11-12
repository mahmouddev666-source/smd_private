/**
 * SMD - Suez Methanol Derivatives Co.
 * Pure helpers for the visual form designer.
 *
 * Kept outside the component so the coordinate math and the server-side limits
 * can be unit-tested without a browser or an API.
 */

import { FormFieldPlacement } from '../types';

/** Must match `KEY_PATTERN` in `apps/api/app/schemas/form.py`. */
export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
/** Must match `BINDING_PATTERN` in the same schema. */
export const BINDING_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.]{0,63}$/;
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const MAX_FIELDS = 200;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Returns the first free `field_<n>` key. */
export function nextFieldKey(fields: { key: string }[]): string {
  const used = new Set(fields.map((field) => field.key));
  let index = 1;
  while (used.has(`field_${index}`)) index += 1;
  return `field_${index}`;
}

/** Mirrors the API validation so the user sees the problem before saving. */
export function validateFields(
  fields: FormFieldPlacement[],
  pageCount: number,
): string | null {
  if (fields.length > MAX_FIELDS) return `عدد الحقول يتجاوز الحد المسموح (${MAX_FIELDS}).`;

  const keys = new Set<string>();
  for (const field of fields) {
    const name = field.label || field.key;
    if (!KEY_PATTERN.test(field.key)) {
      return `مفتاح الحقل «${field.key}» غير صالح: حروف إنجليزية صغيرة وأرقام و_ فقط، ويبدأ بحرف.`;
    }
    if (keys.has(field.key)) return `تم تكرار مفتاح الحقل «${field.key}».`;
    keys.add(field.key);

    if (!BINDING_PATTERN.test(field.binding)) return `ربط الحقل «${name}» غير صالح.`;
    if (!COLOR_PATTERN.test(field.color)) return `لون الحقل «${name}» غير صالح.`;
    if (!Number.isInteger(field.page) || field.page < 1) {
      return `رقم صفحة الحقل «${name}» غير صالح.`;
    }
    if (pageCount > 0 && field.page > pageCount) {
      return `الحقل «${name}» على صفحة ${field.page} بينما المستند ${pageCount} صفحة.`;
    }
    if (field.x < 0 || field.y < 0) {
      return `إحداثيات الحقل «${name}» يجب ألا تكون سالبة.`;
    }
    if (field.width <= 0 || field.height <= 0) {
      return `أبعاد الحقل «${name}» يجب أن تكون أكبر من صفر.`;
    }
    if (field.x + field.width > 100.01 || field.y + field.height > 100.01) {
      return `الحقل «${name}» يتجاوز حدود الصفحة (المجموع يجب ألا يتجاوز 100%).`;
    }
    if (field.fontSize < 6 || field.fontSize > 72) {
      return `حجم خط الحقل «${name}» يجب أن يكون بين 6 و72.`;
    }
  }
  return null;
}

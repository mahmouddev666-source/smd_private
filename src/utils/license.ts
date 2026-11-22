/**
 * SMD - Suez Methanol Derivatives Co.
 * Presentation mapping for the read-only `GET /api/license/status` widget.
 *
 * The API owns all licence decisions. This helper only chooses an Arabic label
 * and colour; it deliberately never derives expiry/enforcement in the browser.
 */

import { LicenseStatus } from '../types';

export type LicenseTone = 'active' | 'expiring' | 'expired' | 'unknown';

export interface LicensePresentation {
  tone: LicenseTone;
  label: string;
  detail: string;
  /** Show the remaining-days chip returned by the server. */
  showCountdown: boolean;
}

const TONE_LABELS: Record<LicenseTone, string> = {
  active: 'الترخيص ساري',
  expiring: 'الترخيص يقارب الانتهاء',
  expired: 'الترخيص غير ساري',
  unknown: 'حالة الترخيص غير معروفة',
};

function toneForStatus(status: string | undefined): LicenseTone {
  switch (status) {
    case 'active':
      return 'active';
    case 'expiring':
      return 'expiring';
    case 'expired':
    case 'invalid':
    case 'hardware_mismatch':
    case 'not_yet_valid':
      return 'expired';
    default:
      return 'unknown';
  }
}

/** The trial/demo licence is labelled explicitly and never shown as a real one. */
export function presentLicenseStatus(
  status: LicenseStatus | null,
  appMode: 'api' | 'demo',
): LicensePresentation {
  if (appMode === 'demo') {
    return {
      tone: 'unknown',
      label: 'وضع العرض التجريبي',
      detail: 'حالة الترخيص من الخادم غير متاحة في هذا الوضع.',
      showCountdown: false,
    };
  }
  if (!status) {
    return {
      tone: 'unknown',
      label: TONE_LABELS.unknown,
      detail: 'تعذر قراءة حالة الترخيص من الخادم. لا يُعد هذا دليلاً على انتهائه.',
      showCountdown: false,
    };
  }

  const tone = toneForStatus(status.status);
  const demoPrefix = status.mode === 'demo' ? 'بيئة تجريبية — ' : '';
  let detail = status.message || 'لا توجد تفاصيل إضافية من الخادم.';
  if (status.expiresOn) detail += ` تنتهي الصلاحية في ${status.expiresOn}.`;
  detail = demoPrefix + detail;

  return {
    tone,
    label: TONE_LABELS[tone],
    detail,
    showCountdown: tone === 'expiring' && status.daysRemaining !== null,
  };
}

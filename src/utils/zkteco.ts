/**
 * SMD - Suez Methanol Derivatives Co.
 * ZKTeco presentation helpers shared by the device screen and its unit tests.
 */

import { DeviceConnection, ZKTecoDevice, ZktecoSyncLog } from '../types';

const STATUS_META: Record<ZKTecoDevice['status'], { label: string; tone: string }> = {
  connected: {
    label: 'متصل بالشبكة',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  syncing: {
    label: 'جاري المزامنة',
    tone: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  error: {
    label: 'خطأ في الاتصال',
    tone: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  disconnected: {
    label: 'غير متصل',
    tone: 'bg-slate-100 text-slate-600 border-slate-300',
  },
};

export function deviceStatusMeta(status: ZKTecoDevice['status']) {
  return STATUS_META[status] ?? STATUS_META.disconnected;
}

export function summarizeSyncResult(log: ZktecoSyncLog): string {
  if (log.status === 'failed') {
    return `تعذّرت المزامنة: ${log.errorMessage || 'خطأ غير معروف'}`;
  }
  if (log.status === 'running') return 'جارٍ سحب الحركات من الجهاز...';

  const parts = [
    `تم سحب ${log.fetchedCount} حركة`,
    `حُفظت ${log.insertedCount} حركة جديدة`,
  ];
  if (log.duplicateCount > 0) parts.push(`تم تجاهل ${log.duplicateCount} حركة مكررة`);
  if (log.unknownCount > 0) parts.push(`${log.unknownCount} بصمة لكود موظف غير مسجل`);
  return `${parts.join(' — ')}.`;
}

export function summarizeConnection(info: DeviceConnection): string {
  const extras = [
    info.serialNumber ? `السيريال: ${info.serialNumber}` : '',
    info.firmwareVersion ? `الفيرموير: ${info.firmwareVersion}` : '',
    `المستخدمون: ${info.userCount}`,
    `الحركات: ${info.logCount}`,
  ].filter(Boolean);
  return `${info.message} (${extras.join(' · ')})`;
}

/** Server timestamps are Cairo-local ISO strings; keep them readable, no Date parsing. */
export function formatSyncTime(value?: string | null): string {
  if (!value) return '—';
  return value.replace('T', ' ').replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/, '').slice(0, 19);
}

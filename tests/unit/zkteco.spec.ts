import {describe, expect, it} from 'vitest';
import {deviceStatusMeta, formatSyncTime, summarizeConnection, summarizeSyncResult} from '../../src/utils/zkteco';
import {DeviceConnection, ZktecoSyncLog} from '../../src/types';

function log(partial: Partial<ZktecoSyncLog>): ZktecoSyncLog {
  return {
    id: 'SYNC-1',
    deviceId: 'DEV-1',
    status: 'success',
    startedAt: '2026-11-12T07:55:00',
    finishedAt: '2026-11-12T07:55:02',
    fetchedCount: 4,
    insertedCount: 4,
    duplicateCount: 0,
    unknownCount: 0,
    errorMessage: '',
    ...partial,
  };
}

const connection: DeviceConnection = {
  status: 'connected',
  serialNumber: 'SN-123',
  firmwareVersion: '6.60.1',
  deviceName: 'K40',
  userCount: 42,
  logCount: 1200,
  message: 'تم الاتصال بنجاح بجهاز البوابة.',
};

describe('ZKTeco sync summaries', () => {
  it('reports fetched and inserted counts for a new sync', () => {
    expect(summarizeSyncResult(log({}))).toBe(
      'تم سحب 4 حركة — حُفظت 4 حركة جديدة.',
    );
  });

  it('mentions duplicates on the second run instead of pretending new data', () => {
    const text = summarizeSyncResult(log({insertedCount: 0, duplicateCount: 4}));
    expect(text).toContain('حُفظت 0 حركة جديدة');
    expect(text).toContain('تم تجاهل 4 حركة مكررة');
  });

  it('flags unknown employee PINs', () => {
    const text = summarizeSyncResult(log({insertedCount: 3, unknownCount: 1}));
    expect(text).toContain('1 بصمة لكود موظف غير مسجل');
  });

  it('shows the server error message when the run fails', () => {
    expect(summarizeSyncResult(log({status: 'failed', errorMessage: 'انتهت المهلة.'}))).toBe(
      'تعذّرت المزامنة: انتهت المهلة.',
    );
  });

  it('includes serial, firmware and counts in the connection summary', () => {
    const text = summarizeConnection(connection);
    expect(text).toContain('SN-123');
    expect(text).toContain('6.60.1');
    expect(text).toContain('المستخدمون: 42');
    expect(text).toContain('الحركات: 1200');
  });
});

describe('ZKTeco device presentation', () => {
  it('maps every status to a distinct Arabic label', () => {
    expect(deviceStatusMeta('connected').label).toBe('متصل بالشبكة');
    expect(deviceStatusMeta('error').label).toBe('خطأ في الاتصال');
    expect(deviceStatusMeta('disconnected').label).toBe('غير متصل');
  });

  it('formats server timestamps without timezone suffixes', () => {
    expect(formatSyncTime('2026-11-12T07:55:00')).toBe('2026-11-12 07:55:00');
    expect(formatSyncTime('2026-11-12T07:55:00+02:00')).toBe('2026-11-12 07:55:00');
    expect(formatSyncTime(undefined)).toBe('—');
  });
});

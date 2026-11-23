import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  DEFAULT_OVERTIME_SETTINGS,
  calculateOvertime,
  configureOvertimeSettings,
  getOvertimeSettings,
  resetOvertimeSettings,
  splitOvertimeMinutes,
} from '../../src/utils/overtimeCalculator';
import {
  applyWorkSettings,
  clearWorkSettings,
  loadWorkSettings,
} from '../../src/hooks/useWorkSettings';
import {WorkSettings} from '../../src/types';

/**
 * Phase B — the calculator must read `work_settings`, not literals.
 * The approved values (`18:00`, `1.35`, `1.70`, shift windows) stay the default
 * contract; these tests prove both the contract and that a DB change moves the
 * result without changing code.
 */
describe('overtime engine — settings-driven golden cases', () => {
  beforeEach(() => {
    clearWorkSettings();
  });

  it('splits 16:00 → 20:00 into 2h day @1.35 + 2h night @1.70', () => {
    const split = splitOvertimeMinutes(16 * 60, 20 * 60);
    expect(split).toEqual({day: 120, night: 120});

    const result = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 150);
    expect(result.dayOvertimeHours).toBe(2);
    expect(result.nightOvertimeHours).toBe(2);
    expect(result.dayOvertimePay).toBe(405);
    expect(result.nightOvertimePay).toBe(510);
    expect(result.totalOvertimePay).toBe(915);
  });

  it('counts midnight → 02:00 as 2h night @1.70', () => {
    const split = splitOvertimeMinutes(0, 2 * 60);
    expect(split.day).toBe(0);
    expect(split.night).toBe(120);
    expect(split.day + split.night).toBe(120); // never double-counted
    expect((split.night / 60) * 100 * 1.7).toBeCloseTo(340, 2);
  });

  it('never double-counts day + night against the total', () => {
    const result = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 150);
    expect(result.dayOvertimeHours + result.nightOvertimeHours).toBe(result.totalOvertimeHours);
    expect(result.dayOvertimePay + result.nightOvertimePay).toBe(result.totalOvertimePay);
    expect(Number.isNaN(result.totalOvertimePay)).toBe(false);
  });
});

describe('overtime engine — changing settings changes results', () => {
  beforeEach(() => {
    clearWorkSettings();
  });

  it('applies a new cutoff and both multipliers', () => {
    const before = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 100);
    expect(before.totalOvertimePay).toBe(610); // 2*100*1.35 + 2*100*1.70

    configureOvertimeSettings({
      overtimeCutoff: '20:00',
      overtimeDayMultiplier: 1.5,
      overtimeNightMultiplier: 2.0,
    });
    const after = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 100);
    expect(after.dayOvertimeHours).toBe(4);
    expect(after.nightOvertimeHours).toBe(0);
    expect(after.dayOvertimePay).toBe(600);
    expect(after.totalOvertimePay).toBe(600);
    expect(after.totalOvertimePay).not.toBe(before.totalOvertimePay);

    configureOvertimeSettings({overtimeCutoff: '17:00'});
    const moved = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 100);
    expect(moved.dayOvertimeHours).toBe(1);
    expect(moved.nightOvertimeHours).toBe(3);
    expect(moved.totalOvertimePay).toBe(645); // 100*1.35 + 3*100*1.70
  });

  it('applies new shift windows and the late grace period', () => {
    configureOvertimeSettings({normalStart: '09:00', normalEnd: '17:00', lateGraceMinutes: 5});

    const lateOnly = calculateOvertime('NORMAL_DAY', '09:10', '17:00', 100);
    expect(lateOnly.lateMinutes).toBe(10);
    expect(lateOnly.totalOvertimeHours).toBe(0);
    expect(lateOnly.suggestedStatus).toBe('متأخر');

    const result = calculateOvertime('NORMAL_DAY', '09:00', '19:00', 100);
    expect(result.standardHours).toBe(8);
    // Overtime 17:00 → 19:00 crosses the 18:00 cutoff: 1h day + 1h night.
    expect(result.dayOvertimeHours).toBe(1);
    expect(result.nightOvertimeHours).toBe(1);
  });

  it('falls back to the approved defaults for invalid settings', () => {
    configureOvertimeSettings({
      normalStart: 'not-a-time',
      overtimeDayStart: '99:99',
      overtimeDayMultiplier: Number.NaN,
      overtimeNightMultiplier: -2,
      lateGraceMinutes: -5,
    });
    expect(getOvertimeSettings()).toEqual(DEFAULT_OVERTIME_SETTINGS);

    const result = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 150);
    expect(result.isValid).toBe(true);
    expect(result.totalOvertimePay).toBe(915);
  });
});

function workSettings(overrides: Partial<WorkSettings> = {}): WorkSettings {
  return {
    id: 1,
    timezone: 'Africa/Cairo',
    normalStart: '08:00',
    normalEnd: '16:00',
    dayStart: '08:00',
    dayEnd: '20:00',
    nightStart: '20:00',
    nightEnd: '08:00',
    overtimeDayStart: '06:00',
    overtimeCutoff: '22:00',
    overtimeDayMultiplier: 1.4,
    overtimeNightMultiplier: 1.9,
    lateGraceMinutes: 10,
    version: 2,
    updatedBy: 'hr-user',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

function workSettingsDto(overrides: Partial<WorkSettings> = {}) {
  const settings = workSettings(overrides);
  return {
    id: settings.id,
    timezone: settings.timezone,
    normal_start: settings.normalStart,
    normal_end: settings.normalEnd,
    day_start: settings.dayStart,
    day_end: settings.dayEnd,
    night_start: settings.nightStart,
    night_end: settings.nightEnd,
    overtime_day_start: settings.overtimeDayStart,
    overtime_cutoff: settings.overtimeCutoff,
    overtime_day_multiplier: settings.overtimeDayMultiplier,
    overtime_night_multiplier: settings.overtimeNightMultiplier,
    late_grace_minutes: settings.lateGraceMinutes,
    version: settings.version,
    updated_by: settings.updatedBy,
    created_at: settings.createdAt,
    updated_at: settings.updatedAt,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('work settings loader', () => {
  beforeEach(() => {
    clearWorkSettings();
    // `request()` uses window.setTimeout; Node has no window object.
    vi.stubGlobal('window', globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearWorkSettings();
  });

  it('fetches /api/settings/work and applies it to the engine', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(input.toString());
        return jsonResponse(workSettingsDto());
      }),
    );

    const applied = await loadWorkSettings(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/settings/work');
    expect(applied.overtimeCutoff).toBe('22:00');

    // 16:00 → 20:00 is entirely inside the loaded 06:00–22:00 day bracket,
    // and 4h * 100 * 1.4 = 560 (the default settings would have split it).
    const result = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 100);
    expect(result.dayOvertimeHours).toBe(4);
    expect(result.nightOvertimeHours).toBe(0);
    expect(result.totalOvertimePay).toBe(560);

    // The second call reuses the cache instead of hitting the network again.
    await loadWorkSettings();
    expect(calls).toHaveLength(1);

    // `applyWorkSettings` updates the engine immediately (used after saving).
    applyWorkSettings(workSettings({overtimeCutoff: '18:00', overtimeDayMultiplier: 1.35, overtimeNightMultiplier: 1.7}));
    const back = calculateOvertime('NORMAL_DAY', '08:00', '20:00', 100);
    expect(back.dayOvertimeHours).toBe(2);
    expect(back.nightOvertimeHours).toBe(2);
    expect(back.totalOvertimePay).toBe(610);

    // Clearing returns to the approved defaults (demo/logout).
    clearWorkSettings();
    expect(getOvertimeSettings()).toEqual(DEFAULT_OVERTIME_SETTINGS);
  });
});

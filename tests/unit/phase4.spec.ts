import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  canEditDocument,
  canUseOfficeEditor,
  isOfficeEditableFile,
  parseOfficeLoadTimeoutMs,
  shouldFallBackToLegacyPreview,
} from '../../src/utils/office';
import {presentLicenseStatus} from '../../src/utils/license';
import {
  formFromWorkSettings,
  toWorkSettingsPatch,
  validateWorkSettingsForm,
  WorkSettingsForm,
} from '../../src/utils/workSettings';
import {
  closeOfficeSession,
  fetchLicenseStatus,
  fetchOfficeConfig,
  fetchOfficeStatus,
  fetchOfficeVersions,
  fetchWorkSettings,
  patchWorkSettings,
} from '../../src/services/apiClient';
import {LicenseStatus, OfficeStatus, WorkSettings} from '../../src/types';

const officeStatus: OfficeStatus = {
  enabled: true,
  available: true,
  documentserverVersion: '10.0.0',
  checkedAt: '2026-11-22T10:00:00Z',
};

const workSettings: WorkSettings = {
  id: 1,
  timezone: 'Africa/Cairo',
  normalStart: '08:00',
  normalEnd: '16:00',
  dayStart: '08:00',
  dayEnd: '20:00',
  nightStart: '20:00',
  nightEnd: '08:00',
  overtimeDayStart: '18:00',
  overtimeCutoff: '22:00',
  overtimeDayMultiplier: 1.35,
  overtimeNightMultiplier: 1.7,
  lateGraceMinutes: 15,
  version: 4,
  updatedBy: 'hr-user',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

const licenseStatus: LicenseStatus = {
  status: 'active',
  mode: 'production',
  source: 'license.json',
  licenseKeyPresent: true,
  clientName: 'SMD',
  issuedOn: '2026-01-01',
  expiresOn: '2027-12-31',
  daysRemaining: 400,
  hardwareMatches: true,
  enforced: true,
  message: 'الترخيص ساري.',
  checkedAt: '2026-11-22T10:00:00Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function workSettingsDto() {
  return {
    id: workSettings.id,
    timezone: workSettings.timezone,
    normal_start: workSettings.normalStart,
    normal_end: workSettings.normalEnd,
    day_start: workSettings.dayStart,
    day_end: workSettings.dayEnd,
    night_start: workSettings.nightStart,
    night_end: workSettings.nightEnd,
    overtime_day_start: workSettings.overtimeDayStart,
    overtime_cutoff: workSettings.overtimeCutoff,
    overtime_day_multiplier: workSettings.overtimeDayMultiplier,
    overtime_night_multiplier: workSettings.overtimeNightMultiplier,
    late_grace_minutes: workSettings.lateGraceMinutes,
    version: workSettings.version,
    updated_by: workSettings.updatedBy,
    created_at: workSettings.createdAt,
    updated_at: workSettings.updatedAt,
  };
}

describe('Phase 4A: ONLYOFFICE enablement and fallback', () => {
  it('offers editing only to ADMIN/HR for Word and Excel', () => {
    expect(canEditDocument('ADMIN')).toBe(true);
    expect(canEditDocument('HR')).toBe(true);
    expect(canEditDocument('VIEWER')).toBe(false);
    expect(isOfficeEditableFile({kind: 'word'})).toBe(true);
    expect(isOfficeEditableFile({kind: 'excel'})).toBe(true);
    expect(isOfficeEditableFile({kind: 'pdf'})).toBe(false);
    expect(isOfficeEditableFile({kind: 'image'})).toBe(false);
  });

  it('requires the build flag, API mode, a healthy server and an editor role', () => {
    const base = {
      role: 'HR' as const,
      flagEnabled: true,
      apiEnabled: true,
      status: officeStatus,
    };
    expect(canUseOfficeEditor(base)).toBe(true);
    expect(canUseOfficeEditor({...base, flagEnabled: false})).toBe(false);
    expect(canUseOfficeEditor({...base, apiEnabled: false})).toBe(false);
    expect(canUseOfficeEditor({...base, role: 'VIEWER'})).toBe(false);
    expect(canUseOfficeEditor({...base, status: null})).toBe(false);
    expect(canUseOfficeEditor({...base, status: {...officeStatus, available: false}})).toBe(false);
  });

  it('keeps the legacy preview as the fallback path', () => {
    expect(shouldFallBackToLegacyPreview(false, false)).toBe(true);
    expect(shouldFallBackToLegacyPreview(true, true)).toBe(true);
    expect(shouldFallBackToLegacyPreview(true, false)).toBe(false);
  });

  it('bounds the editor load timeout', () => {
    expect(parseOfficeLoadTimeoutMs(undefined)).toBe(20000);
    expect(parseOfficeLoadTimeoutMs('not-a-number')).toBe(20000);
    expect(parseOfficeLoadTimeoutMs('100')).toBe(5000);
    expect(parseOfficeLoadTimeoutMs('999999')).toBe(120000);
    expect(parseOfficeLoadTimeoutMs('25000')).toBe(25000);
  });
});

describe('Phase 4B: work settings mapping and validation', () => {
  it('validates the approved boundaries and multipliers', () => {
    const valid: WorkSettingsForm = formFromWorkSettings(workSettings);
    expect(validateWorkSettingsForm(valid)).toEqual({});

    expect(validateWorkSettingsForm({...valid, normalStart: '08:00', normalEnd: '08:00'})).toHaveProperty('normalEnd');
    expect(validateWorkSettingsForm({...valid, overtimeDayStart: '18:0'})).toHaveProperty('overtimeDayStart');
    expect(validateWorkSettingsForm({...valid, overtimeNightMultiplier: '5.1'})).toHaveProperty('overtimeNightMultiplier');
    expect(validateWorkSettingsForm({...valid, lateGraceMinutes: '-1'})).toHaveProperty('lateGraceMinutes');
  });

  it('builds a snake_case patch carrying the expected version', () => {
    const patch = toWorkSettingsPatch(formFromWorkSettings(workSettings), 4);
    expect(patch.expectedVersion).toBe(4);
    expect(patch.normalStart).toBe('08:00');
    expect(patch.overtimeDayMultiplier).toBe(1.35);
  });
});

describe('Phase 4C: licence presentation', () => {
  it('maps server statuses to Arabic banner tones', () => {
    expect(presentLicenseStatus(licenseStatus, 'api').tone).toBe('active');
    expect(presentLicenseStatus({...licenseStatus, status: 'expiring'}, 'api').tone).toBe('expiring');
    expect(presentLicenseStatus({...licenseStatus, status: 'expired'}, 'api').tone).toBe('expired');
    expect(presentLicenseStatus(null, 'api').tone).toBe('unknown');
    expect(presentLicenseStatus(licenseStatus, 'demo').label).toBe('وضع العرض التجريبي');
  });

  it('labels demo-mode server licences instead of presenting them as real ones', () => {
    const view = presentLicenseStatus({...licenseStatus, mode: 'demo'}, 'api');
    expect(view.detail.startsWith('بيئة تجريبية')).toBe(true);
  });
});

describe('Phase 4 API client contracts', () => {
  let calls: {url: string; init?: RequestInit}[];

  beforeEach(() => {
    calls = [];
    // `request()` uses window.setTimeout; Node has no window object.
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({url: input.toString(), init});
        const url = new URL(input.toString(), 'http://local.test');
        if (url.pathname.endsWith('/license/status')) {
          return jsonResponse({
            status: licenseStatus.status,
            mode: licenseStatus.mode,
            source: licenseStatus.source,
            license_key_present: true,
            client_name: 'SMD',
            issued_on: '2026-01-01',
            expires_on: '2027-12-31',
            days_remaining: 400,
            hardware_matches: true,
            enforced: true,
            message: 'الترخيص ساري.',
            checked_at: licenseStatus.checkedAt,
          });
        }
        if (url.pathname.endsWith('/settings/work')) {
          return jsonResponse(workSettingsDto());
        }
        if (url.pathname.endsWith('/office/status')) return jsonResponse(officeStatus);
        if (url.pathname.includes('/office/config/')) {
          return jsonResponse({
            documentServerUrl: '/onlyoffice',
            session: {id: 'session-1', expiresAt: '2026-11-22T11:00:00Z'},
            version: {id: 'version-1', number: 3, extension: 'docx', isOriginal: true, checksum: 'abc'},
            config: {documentType: 'word', token: 'signed'},
          });
        }
        if (url.pathname.endsWith('/versions')) return jsonResponse({items: [], total: 0});
        if (url.pathname.endsWith('/sessions/close')) return jsonResponse(undefined, 204);
        throw new Error(`unexpected URL: ${url.pathname}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps the licence status response to camelCase', async () => {
    const result = await fetchLicenseStatus();
    expect(result.licenseKeyPresent).toBe(true);
    expect(result.daysRemaining).toBe(400);
  });

  it('maps work settings and sends snake_case fields on PATCH', async () => {
    const loaded = await fetchWorkSettings();
    expect(loaded.normalStart).toBe('08:00');
    expect(loaded.overtimeDayMultiplier).toBe(1.35);

    await patchWorkSettings(toWorkSettingsPatch(formFromWorkSettings(workSettings), 4));
    const body = JSON.parse(String(calls[calls.length - 1].init?.body)) as Record<string, unknown>;
    expect(calls[calls.length - 1].init?.method).toBe('PATCH');
    expect(body.expected_version).toBe(4);
    expect(body.normal_start).toBe('08:00');
  });

  it('requests signed office config, versions and session close', async () => {
    await fetchOfficeStatus();
    await fetchOfficeConfig('file-1', 'version-2');
    await fetchOfficeVersions('file-1');
    await closeOfficeSession('file-1');

    expect(calls[1].url).toContain('/office/config/file-1?version_id=version-2');
    expect(calls[3].url).toContain('/office/files/file-1/sessions/close');
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({reason: 'forced'});
  });
});

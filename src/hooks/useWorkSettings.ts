/**
 * SMD - Suez Methanol Derivatives Co.
 * Loads the approved work settings into the overtime engine (Phase B).
 *
 * The database row behind `GET /api/settings/work` is the single source of
 * truth for shift windows, the overtime day/night boundary, both multipliers
 * and the late grace period. This module fetches it once per session, applies
 * it with `configureOvertimeSettings`, and exposes a reactive
 * `useOvertimeSettings()` hook for components that display the live values.
 *
 * The browser never computes with literals after this point: if the request
 * fails, the engine keeps the previously loaded values (or the approved
 * fallback defaults), so the UI degrades safely instead of inventing numbers.
 */

import { useSyncExternalStore } from 'react';
import * as api from '../services/apiClient';
import { WorkSettings } from '../types';
import {
  OvertimeSettings,
  configureOvertimeSettings,
  getOvertimeSettings,
  overtimeSettingsFromWorkSettings,
  resetOvertimeSettings,
  subscribeOvertimeSettings,
} from '../utils/overtimeCalculator';

let cachedSettings: WorkSettings | null = null;
let inFlight: Promise<OvertimeSettings> | null = null;

/** Apply a settings object returned by the API (or the HR form) to the engine. */
export function applyWorkSettings(settings: WorkSettings): OvertimeSettings {
  cachedSettings = settings;
  return configureOvertimeSettings(overtimeSettingsFromWorkSettings(settings));
}

/**
 * Fetch and apply `/api/settings/work`.
 *
 * - `force = false` reuses the cached row during the same session.
 * - `force = true` is used on login/refresh so edited HR values take effect.
 * Concurrent callers share one request.
 */
export async function loadWorkSettings(force = false): Promise<OvertimeSettings> {
  if (!force && cachedSettings) {
    return applyWorkSettings(cachedSettings);
  }
  if (inFlight) return inFlight;

  const request = api
    .fetchWorkSettings()
    .then((settings) => applyWorkSettings(settings))
    .finally(() => {
      inFlight = null;
    });
  inFlight = request;
  return request;
}

/** Reset the engine and the cache (demo fallback, logout, test isolation). */
export function clearWorkSettings(): OvertimeSettings {
  cachedSettings = null;
  inFlight = null;
  return resetOvertimeSettings();
}

/** The raw API row cached for this session, if it was loaded. */
export function getCachedWorkSettings(): WorkSettings | null {
  return cachedSettings;
}

/** Reactive settings for UI labels/previews; updates after every apply. */
export function useOvertimeSettings(): OvertimeSettings {
  return useSyncExternalStore(
    subscribeOvertimeSettings,
    getOvertimeSettings,
    getOvertimeSettings,
  );
}

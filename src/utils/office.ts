/**
 * SMD - Suez Methanol Derivatives Co.
 * Pure decision helpers for the optional ONLYOFFICE editor.
 *
 * No `import.meta.env` here: the build-time flag is read once by the caller and
 * passed in, so these rules stay testable in a plain Node/Vitest environment.
 * The server remains the authority; these helpers only decide whether the UI
 * should *offer* the editor. When they return false the untouched legacy
 * preview/download flow is used instead.
 */

import { FormFile, OfficeStatus, UserRole } from '../types';

/** Only modern Word/Excel can be opened by the editor (legacy doc/xls are rejected server-side). */
export const OFFICE_EDITABLE_KINDS: FormFile['kind'][] = ['word', 'excel'];

export function isOfficeEditableFile(file: Pick<FormFile, 'kind'>): boolean {
  return OFFICE_EDITABLE_KINDS.includes(file.kind);
}

/** Mirrors the API's `DOCUMENT_EDITOR_ROLES` without granting permission by itself. */
export function canEditDocument(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'HR';
}

export interface OfficeAvailabilityInput {
  role: UserRole;
  /** `VITE_ONLYOFFICE_ENABLED === 'true'` baked into this build. */
  flagEnabled: boolean;
  /** The active data source must be the API; the IndexedDB demo has no editor. */
  apiEnabled: boolean;
  /** Last successful `GET /api/office/status`, or null when unavailable/unchecked. */
  status: OfficeStatus | null;
}

/**
 * True only when every gate is open. A missing/failed health check keeps the
 * button hidden rather than letting the editor fail in front of the user.
 */
export function canUseOfficeEditor(input: OfficeAvailabilityInput): boolean {
  return (
    input.flagEnabled &&
    input.apiEnabled &&
    input.status !== null &&
    input.status.enabled &&
    input.status.available &&
    canEditDocument(input.role)
  );
}

/** `VITE_OFFICE_LOAD_TIMEOUT_MS`, with sane bounds for a browser editor. */
export function parseOfficeLoadTimeoutMs(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20000;
  return Math.min(120000, Math.max(5000, Math.floor(parsed)));
}

/**
 * Fallback contract for Phase 4E: whenever the editor was never opened, or it
 * failed to load, the legacy Overlay/PDF.js preview must remain reachable.
 */
export function shouldFallBackToLegacyPreview(
  editorRequested: boolean,
  editorFailed: boolean,
): boolean {
  return !editorRequested || editorFailed;
}

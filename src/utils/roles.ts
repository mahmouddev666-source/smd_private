/**
 * SMD - Suez Methanol Derivatives Co.
 * Single source of truth for role capabilities in the UI.
 *
 * The server is still the only authority (see AGENTS.md §9); these helpers only
 * hide actions the current role cannot perform, so a stale UI never looks
 * broken after a 403.
 */

import { UserRole } from '../types';

/** Roles allowed to create/update business data (mirrors the API EDITOR_ROLES). */
export const EDITOR_ROLES: UserRole[] = ['ADMIN', 'HR'];

export function canEdit(role: UserRole): boolean {
  return EDITOR_ROLES.includes(role);
}

export function isAdmin(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function roleLabel(role: UserRole): string {
  if (role === 'ADMIN') return 'مدير النظام';
  if (role === 'HR') return 'موارد بشرية (محرر)';
  return 'مستخدم قراءة فقط';
}

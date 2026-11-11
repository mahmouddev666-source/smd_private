/**
 * SMD - Suez Methanol Derivatives Co.
 * Unique identifier helpers.
 *
 * Business identifiers must be globally unique, never derived from
 * `array.length` (which produces collisions after deletions).
 */

/** Returns a RFC 4122 v4 UUID, with a fallback for non-secure contexts. */
export function uuid(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    cryptoObject.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Human-friendly prefixed id, e.g. `ATT-3f2c1a9b`. */
export function newId(prefix: string): string {
  return `${prefix}-${uuid().replace(/-/g, '').slice(0, 10)}`;
}

/**
 * Stable key for detecting duplicate attendance rows:
 * one attendance record per employee per calendar day.
 */
export function attendanceKey(employeeId: string, date: string): string {
  return `${employeeId.trim()}::${date.trim()}`;
}

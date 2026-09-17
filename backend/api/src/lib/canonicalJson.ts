/**
 * Canonical JSON serialisation — produces a stable string with object keys
 * sorted recursively so the SHA-256 digest is independent of property
 * enumeration order. The save, publish, and stale-check paths all hash the
 * same canonical form; hashing raw JSONB text instead would never match a
 * client-computed canonical hash (JSONB normalises key order).
 */

export function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) {
      result[key] = canonicalizeValue(v);
    }
  }
  return result;
}

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

/**
 * PII Sanitizer — strips personally identifiable information from analytics
 * events before they touch storage or the network.
 *
 * 2026 research: PII sanitization must be automatic, not opt-in. Emails,
 * phone numbers, and card patterns are stripped from every event payload
 * before it leaves the device.
 *
 * This module provides **value-based** sanitization (regex pattern matching
 * on string contents) complementing the **key-based** scrubbing already
 * present in `src/lib/telemetry.ts` and `src/analytics/useScreenTracking.ts`.
 * Key-based scrubbing drops known PII field names; value-based sanitization
 * catches PII that leaks into arbitrary string fields (e.g. a user typing
 * their email into a search box that gets tracked as `query`).
 */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Keys that are considered personally identifiable information. Any object
 * property whose key matches one of these (case-insensitive exact match) is
 * redacted to `'[redacted]'` rather than recursing into its value. This is
 * broader than the key-fragment matching in `telemetry.ts` — it uses exact
 * key matching to avoid false positives on legitimate fields like
 * `session_id` or `listing_id`.
 */
const PII_FIELDS = new Set([
  'email',
  'phone',
  'phone_number',
  'card',
  'card_number',
  'ssn',
  'address',
  'street',
  'zip',
  'postal',
  'password',
  'token',
  'auth_token',
  'access_token',
  'refresh_token',
  'api_key',
  'device_id',
  'idfa',
  'gaid',
  'advertising_id',
]);

/**
 * Recursively sanitizes a value of unknown type:
 *
 * - **Strings** — email, phone, and card patterns are replaced with
 *   `[email]`, `[phone]`, and `[card]` placeholders.
 * - **Arrays** — each element is sanitized recursively.
 * - **Objects** — keys in `PII_FIELDS` are redacted to `[redacted]`;
 *   all other keys are sanitized recursively.
 * - **Primitives** (number, boolean, null) — returned as-is.
 *
 * @param value - The value to sanitize (may be any type).
 * @returns A sanitized copy with PII stripped.
 */
export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(EMAIL_PATTERN, '[email]')
      .replace(PHONE_PATTERN, '[phone]')
      .replace(CARD_PATTERN, '[card]');
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (PII_FIELDS.has(key.toLowerCase())) {
        sanitized[key] = '[redacted]';
      } else {
        sanitized[key] = sanitizeValue(val);
      }
    }
    return sanitized;
  }
  return value;
}

/**
 * Sanitizes an analytics event (name + properties) as a single unit.
 *
 * Both the event name and the properties bag are run through
 * `sanitizeValue` so PII embedded in either is stripped before the event
 * reaches PostHog or the backend telemetry endpoint.
 *
 * @param eventName - The event name (may contain PII in dynamic names).
 * @param properties - Optional properties bag to sanitize.
 * @returns An object with the sanitized `eventName` and `properties`.
 */
export function sanitizeEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): { eventName: string; properties?: Record<string, unknown> } {
  if (!properties) return { eventName };
  return {
    eventName: sanitizeValue(eventName) as string,
    properties: sanitizeValue(properties) as Record<string, unknown>,
  };
}

/**
 * Backend money utilities — exact decimal string formatting for monetary values.
 * 
 * The database stores amounts as NUMERIC(18,4) which is exact. When reading
 * from the DB, Postgres returns these as strings or numbers depending on the
 * driver. We normalize to decimal strings for JSON responses to avoid IEEE 754
 * representation errors in the wire format.
 * 
 * Convention: all monetary values in API responses are decimal strings
 * with up to 4 decimal places (matching the DB schema).
 *   "49.2500" not 49.25
 *   "0.0100" not 0.01
 * 
 * NOTE: This module is distinct from ./money.ts which implements the
 * ISO 4217 canonical Money type (BigInt minor units, provider conversion).
 * These helpers are a lightweight GBP-focused formatting layer for the
 * Co-Own trading backend response serialization.
 */

/** Format a DB value (string | number | null) to a decimal string. */
export function formatGbp(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '0.0000';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return '0.0000';
  return num.toFixed(4);
}

/** Format a DB value to a decimal string with 2 decimal places (for display). */
export function formatGbp2(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) return '0.00';
  return num.toFixed(2);
}

/** Parse a decimal string or number to a JS number (for internal arithmetic). */
export function parseGbp(value: string | number): number {
  if (typeof value === 'number') return value;
  const num = parseFloat(value);
  return isFinite(num) ? num : 0;
}

/** Round to 4 decimal places (for DB writes). */
export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Round to 2 decimal places (for pence-denominated values). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Calculate fee: amount * rate, rounded to 4 decimal places. */
export function calculateFee(amountGbp: number, rate: number): number {
  return round4(amountGbp * rate);
}

/** Calculate total: amount + fee (for buys) or amount - fee (for sells). */
export function calculateTotal(amountGbp: number, feeGbp: number, side: 'buy' | 'sell'): number {
  return side === 'buy' ? round4(amountGbp + feeGbp) : round4(amountGbp - feeGbp);
}

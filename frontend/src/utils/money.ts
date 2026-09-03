/**
 * Money — exact monetary arithmetic using BigInt minor units.
 *
 * GBP uses 2 decimal places (pence). All arithmetic is done in integer
 * pence (BigInt) to avoid IEEE 754 floating-point representation errors.
 *
 * Wire format: decimal strings ("49.2500") — exact, reproducible, no
 * precision loss through JSON.parse.
 *
 * Internal format: BigInt minor units (49250n pence = £49.25)
 */

export const GBP_DECIMAL_PLACES = 2;
export const GBP_MINOR_UNIT = 100; // 100 pence = £1

/** Parse a decimal string ("49.25") to BigInt minor units (4925n). */
export function parseGbpToMinor(decimalString: string): bigint {
  if (!decimalString || typeof decimalString !== 'string') return 0n;
  const trimmed = decimalString.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 0n;
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ''] = abs.split('.');
  const paddedFrac = (frac + '00').slice(0, GBP_DECIMAL_PLACES);
  const minorStr = whole + paddedFrac;
  const minor = BigInt(minorStr);
  return negative ? -minor : minor;
}

/** Format BigInt minor units (4925n) to decimal string ("49.25"). */
export function formatMinorToGbp(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const absStr = abs.toString().padStart(GBP_DECIMAL_PLACES + 1, '0');
  const whole = absStr.slice(0, absStr.length - GBP_DECIMAL_PLACES);
  const frac = absStr.slice(absStr.length - GBP_DECIMAL_PLACES);
  const trimmedFrac = frac.replace(/0+$/, '');
  const result = trimmedFrac ? `${whole}.${trimmedFrac}` : whole;
  return negative ? `-${result}` : result;
}

/** Add two GBP minor unit values. */
export function addGbp(a: bigint, b: bigint): bigint {
  return a + b;
}

/** Subtract b from a (both GBP minor units). */
export function subGbp(a: bigint, b: bigint): bigint {
  return a - b;
}

/** Multiply GBP minor units by an integer quantity. */
export function mulGbpUnits(priceMinor: bigint, units: number): bigint {
  return priceMinor * BigInt(units);
}

/** Calculate fee: amount * rate, rounded half-up to nearest penny. */
export function feeGbp(amountMinor: bigint, rate: number): bigint {
  // rate is a JS number like 0.01 (1%). Convert to basis points to stay in integer math.
  // 1% = 100 basis points. amountMinor * bps / 10000
  const bps = Math.round(rate * 10000);
  const feeMinor = (amountMinor * BigInt(bps) + 5000n) / 10000n; // half-up rounding
  return feeMinor;
}

/** Convert a JS number (from legacy API responses) to minor units. */
export function gbpToMinor(gbp: number): bigint {
  return BigInt(Math.round(gbp * GBP_MINOR_UNIT));
}

/** Convert minor units back to JS number for legacy display components. */
export function minorToGbp(minor: bigint): number {
  return Number(minor) / GBP_MINOR_UNIT;
}

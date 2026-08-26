/**
 * Co-Own v2 API Contract — exact decimal strings.
 *
 * The v2 contract makes *Str fields the source of truth for all monetary
 * values. Number fields are deprecated and may be removed in v3.
 *
 * Clients MUST use the *Str fields for all arithmetic and display.
 * The v1 number fields are retained only for backward compatibility.
 */

// ── Order Book ────────────────────────────────────────────────────────

export interface CoOwnV2OrderBookLevel {
  side: 'buy' | 'sell';
  unitPriceGbpStr: string; // REQUIRED in v2
  unitPriceGbp?: number; // DEPRECATED — use unitPriceGbpStr
  units: number;
  orderCount: number;
}

export interface CoOwnV2OrderBookSnapshot {
  assetId: string;
  snapshotSequence: number;
  snapshotSequenceStr?: string;
  eventSequence: number;
  bids: CoOwnV2OrderBookLevel[];
  asks: CoOwnV2OrderBookLevel[];
  serverTimestamp: string;
  stalenessThresholdSeconds: number;
  source: 'live' | 'fallback';
  reconciliationState: 'reconciled' | 'stale';
  /** v2 contract version */
  contractVersion: 2;
}

// ── Preview ───────────────────────────────────────────────────────────

export interface CoOwnV2OrderPreview {
  assetId: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market' | 'protected_market';
  unitPriceGbpStr: string;
  unitPriceGbp?: number; // DEPRECATED
  protectionPriceGbpStr?: string;
  protectionPriceGbp?: number; // DEPRECATED
  referencePriceGbpStr: string;
  referencePriceGbp?: number; // DEPRECATED
  orderPriceGbpStr: string;
  orderPriceGbp?: number; // DEPRECATED
  estimatedFill: {
    filledUnits: number;
    remainingUnits: number;
    avgFillPriceStr: string;
    avgFillPrice?: number; // DEPRECATED
    worstPriceStr: string;
    worstPrice?: number; // DEPRECATED
  };
  grossNotionalStr: string;
  grossNotional?: number; // DEPRECATED
  feeStr: string;
  fee?: number; // DEPRECATED
  totalStr: string;
  total?: number; // DEPRECATED
  contractVersion: 2;
}

// ── Reservation ───────────────────────────────────────────────────────

export interface CoOwnV2Reservation {
  id: string;
  assetId: string;
  userId: string;
  side: 'buy' | 'sell';
  reserved1zeMg: number;
  reserved1zeMgStr?: string;
  reservedUnits: number;
  referencePriceGbpStr: string;
  referencePriceGbp?: number; // DEPRECATED
  estimatedTotalGbpStr: string;
  estimatedTotalGbp?: number; // DEPRECATED
  estimatedFeeGbpStr: string;
  estimatedFeeGbp?: number; // DEPRECATED
  expiresAt: string;
  status: 'active' | 'placed' | 'cancelled' | 'expired';
  contractVersion: 2;
}

// ── Order ─────────────────────────────────────────────────────────────

export interface CoOwnV2Order {
  id: string;
  assetId: string;
  userId: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market' | 'protected_market';
  unitPriceGbpStr: string;
  unitPriceGbp?: number; // DEPRECATED
  units: number;
  filledUnits: number;
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled';
  feeGbpStr: string;
  feeGbp?: number; // DEPRECATED
  totalGbpStr: string;
  totalGbp?: number; // DEPRECATED
  contractVersion: 2;
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Assert that a response is a v2 contract response.
 * Throws if the contractVersion is not 2.
 */
export function assertV2<T extends { contractVersion: number }>(
  response: T,
  context: string
): void {
  if (response.contractVersion !== 2) {
    throw new Error(
      `Co-Own v2 contract violation: ${context} returned contractVersion=${response.contractVersion}, expected 2`
    );
  }
}

/**
 * Parse a v2 monetary field to a number via the money utility.
 * This is the canonical way to consume a v2 monetary field.
 */
export function v2Gbp(str: string, fallback?: number): number {
  if (str != null && str !== '') {
    // Inline parse to avoid circular dependency on money.ts
    // Parse "49.2500" → 492500 minor units → 49.25
    const parts = str.split('.');
    const whole = BigInt(parts[0] || '0');
    const frac = parts[1] ?? '';
    const fracPadded = (frac + '0000').slice(0, 4);
    const minor = whole * 10000n + BigInt(fracPadded || '0');
    return Number(minor) / 10000;
  }
  if (fallback != null) return fallback;
  throw new Error(`Co-Own v2: missing required *Str field and no fallback`);
}

/**
 * Parse a v2 monetary field to BigInt minor units.
 * Use this for exact arithmetic.
 */
export function v2Minor(str: string): bigint {
  if (str == null || str === '') {
    throw new Error('Co-Own v2: empty monetary string');
  }
  const parts = str.split('.');
  const whole = BigInt(parts[0] || '0');
  const frac = parts[1] ?? '';
  const fracPadded = (frac + '0000').slice(0, 4);
  return whole * 10000n + BigInt(fracPadded || '0');
}

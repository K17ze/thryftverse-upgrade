'use client';

/**
 * Convert view model — web port of components/wallet/convertViewModels.ts
 * plus the at-par rate math from utils/currency. Money math runs in integer
 * minor units (mirrors utils/trade.ts) so fee/net never drifts by a penny.
 * Fixture mode computes the quote client-side from constants; the mobile
 * surface receives the same shape from the backend quote endpoint.
 */

import { WALLET_BALANCE } from '@/lib/data/fixtures';

// ── Fixture rate constants ────────────────────────────────────────────

/** 1ZE is USD-par by contract (izeToUsd at 1:1). */
export const IZE_USD_PAR = 1;
/** Indicative GBP/USD rate for the fixture dataset. */
export const GBP_PER_USD = 0.79;
/** Platform fee on conversions — 100 bps = 1%. */
export const FEE_BPS = 100;
/** Fixed rate timestamp — deterministic across SSR and client. */
export const RATE_AS_OF = '2026-09-24T09:41:00Z';

/** Open-order hold on the fiat pocket (mobile: reservedForOrders). */
export const GBP_RESERVED = 18.5;

/** 1ZE pocket seed — Co-Own settlement units. */
export const IZE_POCKET_SEED = { settled: 128.4, pending: 6, reserved: 0 };

export type ConvertDirection = 'ize_to_gbp' | 'gbp_to_ize';

export interface ConvertQuote {
  direction: ConvertDirection;
  sourceAmount: number;
  /** Gross value in GBP before the fee. */
  principal: number;
  fee: number;
  feeBps: number;
  /** What lands in the destination pocket (GBP or 1ZE). */
  net: number;
}

export interface ConversionResult extends ConvertQuote {
  id: string;
  /** Signed delta applied to the fiat pocket. */
  gbpDelta: number;
  /** Signed delta applied to the 1ZE pocket. */
  izeDelta: number;
  rate: number;
  timestamp: string;
}

// ── Math ──────────────────────────────────────────────────────────────

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Funds actually convertible — settled minus reserved. */
export function withdrawableOf(settled: number, reserved: number): number {
  return round2(settled - reserved);
}

const toMinor = (major: number): number => Math.round(major * 100);
const toMajor = (minor: number): number => minor / 100;

/**
 * Quote a conversion. Principal is gross; the fee comes off the
 * destination side — never charged on top of the source amount.
 */
export function buildQuote(direction: ConvertDirection, amount: number): ConvertQuote | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  if (direction === 'ize_to_gbp') {
    const principalMinor = Math.round(amount * IZE_USD_PAR * GBP_PER_USD * 100);
    const feeMinor = Math.round((principalMinor * FEE_BPS) / 10_000);
    return {
      direction,
      sourceAmount: round2(amount),
      principal: toMajor(principalMinor),
      fee: toMajor(feeMinor),
      feeBps: FEE_BPS,
      net: toMajor(principalMinor - feeMinor),
    };
  }

  const sourceMinor = toMinor(amount);
  const feeMinor = Math.round((sourceMinor * FEE_BPS) / 10_000);
  const netMinor = sourceMinor - feeMinor;
  return {
    direction,
    sourceAmount: round2(amount),
    principal: toMajor(sourceMinor),
    fee: toMajor(feeMinor),
    feeBps: FEE_BPS,
    net: round2(toMajor(netMinor) / GBP_PER_USD),
  };
}

/** Execute a quote into ledger deltas — the only place money moves. */
export function executeQuote(quote: ConvertQuote): ConversionResult {
  const gbpDelta = quote.direction === 'ize_to_gbp' ? quote.net : -quote.sourceAmount;
  const izeDelta = quote.direction === 'ize_to_gbp' ? -quote.sourceAmount : quote.net;
  return {
    ...quote,
    id: `cv-${Date.now().toString(36)}`,
    gbpDelta: round2(gbpDelta),
    izeDelta: round2(izeDelta),
    rate: quote.direction === 'ize_to_gbp' ? GBP_PER_USD : 1 / GBP_PER_USD,
    timestamp: new Date().toISOString(),
  };
}

/** Current fiat pocket settled balance — fixture seed for session state. */
export function gbpSettledSeed(): number {
  return WALLET_BALANCE.available;
}

// ── Formatting ────────────────────────────────────────────────────────

const decimal2 = new Intl.NumberFormat('en-GB', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1ZE amounts — two decimals; pair with the `tnum` utility. */
export function formatIze(amount: number): string {
  return decimal2.format(amount);
}

/** Direction-aware rate line under the form. */
export function rateLabel(direction: ConvertDirection): string {
  return direction === 'ize_to_gbp'
    ? `£${GBP_PER_USD.toFixed(2)} per 1ZE`
    : `${(1 / GBP_PER_USD).toFixed(4)} 1ZE per £1`;
}

export function rateTimestampLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Decimal-pad input sanitiser — digits and one dot, two places max. */
export function sanitizeAmount(raw: string): string {
  const dot = raw.indexOf('.');
  if (dot === -1) return raw.replace(/\D/g, '').slice(0, 9);
  const head = raw.slice(0, dot).replace(/\D/g, '').slice(0, 9);
  const tail = raw.slice(dot + 1).replace(/\D/g, '').slice(0, 2);
  return `${head}.${tail}`;
}

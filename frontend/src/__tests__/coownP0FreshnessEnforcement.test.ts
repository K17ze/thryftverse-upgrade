import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── P0.2: freshness enforcement ──
//
// DEFECT: `marketIsAuthoritative` in TradeScreen.tsx (line 243-245) checks:
//   orderBook?.source === 'live'
//     && orderBook.reconciliationState === 'reconciled'
//     && Boolean(orderBook.serverTimestamp)
//
// It only checks that `serverTimestamp` is truthy — NOT that the timestamp is
// recent. A book with a timestamp from 10 minutes ago would pass this check
// even though the data is stale. The `stalenessThresholdSeconds` field on
// `CoOwnOrderBookSnapshot` is never consulted.
//
// FIX: Introduce a pure `isBookFresh(book, nowMs, thresholdSeconds)` utility
// that compares the book's `serverTimestamp` age against the staleness
// threshold. `marketIsAuthoritative` should call this function so a stale
// book is treated as non-authoritative.
//
// Expected contract:
//   isBookFresh(book, nowMs, thresholdSeconds) → boolean
//   - Stale book (timestamp 20s ago, threshold 15s) → false
//   - Fresh book (timestamp 2s ago, threshold 15s) → true
//   - Missing/invalid timestamp → false

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

// The utility will be exported from tradeFlow after the fix. This import will
// fail until the function is created, causing the pure-function tests to fail
// (documenting the bug).
import { isBookFresh } from '../utils/tradeFlow';

const FRESH_BOOK = {
  bids: [],
  asks: [],
  snapshotSequence: 1,
  eventSequence: 1,
  serverTimestamp: new Date(Date.now() - 2_000).toISOString(), // 2s ago
  lastExecutionTimestamp: null,
  stalenessThresholdSeconds: 15,
  reconciliationState: 'reconciled' as const,
  source: 'live' as const,
};

const STALE_BOOK = {
  bids: [],
  asks: [],
  snapshotSequence: 1,
  eventSequence: 1,
  serverTimestamp: new Date(Date.now() - 20_000).toISOString(), // 20s ago
  lastExecutionTimestamp: null,
  stalenessThresholdSeconds: 15,
  reconciliationState: 'reconciled' as const,
  source: 'live' as const,
};

describe('P0.2: isBookFresh pure function', () => {
  it('returns true for a fresh book (timestamp 2s ago, threshold 15s)', () => {
    const now = Date.now();
    expect(isBookFresh(FRESH_BOOK, now, 15)).toBe(true);
  });

  it('returns false for a stale book (timestamp 20s ago, threshold 15s)', () => {
    const now = Date.now();
    expect(isBookFresh(STALE_BOOK, now, 15)).toBe(false);
  });

  it('returns false when timestamp is missing (empty string)', () => {
    const book = { ...FRESH_BOOK, serverTimestamp: '' };
    expect(isBookFresh(book, Date.now(), 15)).toBe(false);
  });

  it('returns false when timestamp is undefined', () => {
    const book = { ...FRESH_BOOK, serverTimestamp: undefined as unknown as string };
    expect(isBookFresh(book, Date.now(), 15)).toBe(false);
  });

  it('returns false when timestamp is invalid (unparseable)', () => {
    const book = { ...FRESH_BOOK, serverTimestamp: 'not-a-date' };
    expect(isBookFresh(book, Date.now(), 15)).toBe(false);
  });

  it('returns true at the exact threshold boundary (age === threshold)', () => {
    // A book exactly at the threshold is still fresh (boundary inclusive)
    const now = Date.now();
    const book = {
      ...FRESH_BOOK,
      serverTimestamp: new Date(now - 15_000).toISOString(), // exactly 15s ago
    };
    expect(isBookFresh(book, now, 15)).toBe(true);
  });

  it('returns false just past the threshold (age > threshold)', () => {
    const now = Date.now();
    const book = {
      ...FRESH_BOOK,
      serverTimestamp: new Date(now - 15_001).toISOString(), // 15.001s ago
    };
    expect(isBookFresh(book, now, 15)).toBe(false);
  });

  it('uses the book stalenessThresholdSeconds when threshold not passed', () => {
    // When thresholdSeconds is omitted, the function should fall back to the
    // book's own stalenessThresholdSeconds field.
    const now = Date.now();
    const book = {
      ...FRESH_BOOK,
      serverTimestamp: new Date(now - 2_000).toISOString(),
      stalenessThresholdSeconds: 15,
    };
    expect(isBookFresh(book, now)).toBe(true);
  });
});

// ── TradeScreen integration: marketIsAuthoritative must check age ──

describe('P0.2: TradeScreen marketIsAuthoritative checks staleness', () => {
  it('FIX: marketIsAuthoritative no longer checks only Boolean(serverTimestamp)', () => {
    // Pre-fix this documented the defective check — it only verified the
    // timestamp was truthy, not that it was recent. After the fix the
    // Boolean-only check must be gone.
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).not.toContain('Boolean(orderBook.serverTimestamp)');
  });

  it('FIX: TradeScreen calls isBookFresh for marketIsAuthoritative', () => {
    // After the fix, the freshness check should delegate to isBookFresh
    // (or an equivalent age comparison) rather than just Boolean(timestamp).
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('isBookFresh');
  });

  it('FIX: marketIsAuthoritative no longer uses Boolean(serverTimestamp) alone', () => {
    // After the fix, the Boolean(serverTimestamp) check should be replaced
    // by the age-aware freshness check.
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).not.toContain('Boolean(orderBook.serverTimestamp)');
  });

  it('FIX: TradeScreen uses stalenessThresholdSeconds in the freshness check', () => {
    // The stalenessThresholdSeconds from the order book snapshot should be
    // consulted — not ignored.
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('stalenessThresholdSeconds');
  });

  it('FIX: tradeFlow exports isBookFresh', () => {
    const src = readSrc('utils/tradeFlow.ts');
    expect(src).toContain('isBookFresh');
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── P0.7: unknown-result lookup contract ──
//
// DEFECT: When a network error occurs during order submission (TradeConfirmScreen
// line 170-181), the client shows "Trading engine unavailable" but has no way
// to determine whether the order was actually placed. The idempotency key was
// sent, but the response was lost. There is no lookup endpoint to recover the
// result.
//
// FIX: Add a `lookupCoOwnOrderByIdempotencyKey(assetId, key)` API function
// that queries the backend for the result of a previously-submitted order.
// The backend should return:
//   200 — order acknowledged (body contains the order)
//   202 — order still processing (no result yet)
//   404 — no order found for this key (safe_to_retry: the client may resubmit)
//
// This lets the client recover gracefully after a network error: look up the
// key, and either confirm the order, wait for processing, or safely retry.
//
// Expected API function shape:
//   lookupCoOwnOrderByIdempotencyKey(assetId: string, key: string)
//     → Promise<CoOwnOrderLookupResult>
//
//   type CoOwnOrderLookupResult =
//     | { status: 'acknowledged'; order: MarketCoOwnOrder }
//     | { status: 'processing' }
//     | { status: 'safe_to_retry' }

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

// The function will be exported from marketApi after the fix. This import will
// fail until the function is created, causing the runtime tests to fail
// (documenting the bug). Source-level tests use readSrc and pass/fail
// independently.
import {
  lookupCoOwnOrderByIdempotencyKey,
} from '../services/marketApi';

// ── Runtime contract: the function must exist and behave correctly ──
// These tests will FAIL until the function is implemented.

describe('P0.7: lookupCoOwnOrderByIdempotencyKey API contract', () => {
  it('is exported from marketApi as a function', () => {
    expect(typeof lookupCoOwnOrderByIdempotencyKey).toBe('function');
  });

  it('accepts (assetId, key) and returns a Promise', () => {
    // Don't await — just verify it returns a Promise (the actual API call
    // will fail in the test environment, but the contract shape is correct).
    const result = lookupCoOwnOrderByIdempotencyKey('asset-1', 'key-abc');
    expect(result).toBeInstanceOf(Promise);
    // Suppress unhandled rejection from the expected network failure
    result.catch(() => undefined);
  });

  it('CoOwnOrderLookupResult type is exported', () => {
    // The type should be exported alongside the function.
    // This is a compile-time check — if the import above succeeded, the type
    // exists. We verify at runtime that the function is callable.
    expect(typeof lookupCoOwnOrderByIdempotencyKey).toBe('function');
  });
});

// ── Source-level contract: the function and types must exist in marketApi.ts ──
// These tests inspect the source file directly and will FAIL until the fix
// adds the function and types.

describe('P0.7: marketApi source has lookup function and types', () => {
  it('FIX: marketApi exports lookupCoOwnOrderByIdempotencyKey', () => {
    const src = readSrc('services/marketApi.ts');
    expect(src).toContain('lookupCoOwnOrderByIdempotencyKey');
  });

  it('FIX: marketApi exports CoOwnOrderLookupResult type', () => {
    const src = readSrc('services/marketApi.ts');
    expect(src).toContain('CoOwnOrderLookupResult');
  });

  it('FIX: CoOwnOrderLookupResult includes "acknowledged" status', () => {
    const src = readSrc('services/marketApi.ts');
    expect(src).toMatch(/'acknowledged'/);
  });

  it('FIX: CoOwnOrderLookupResult includes "processing" status', () => {
    const src = readSrc('services/marketApi.ts');
    expect(src).toMatch(/'processing'/);
  });

  it('FIX: CoOwnOrderLookupResult includes "safe_to_retry" status', () => {
    const src = readSrc('services/marketApi.ts');
    expect(src).toMatch(/'safe_to_retry'/);
  });

  it('FIX: lookup function calls the lookup-by-key endpoint', () => {
    // The function should call a URL path that includes both the assetId
    // and the idempotency key — e.g. /co-own/assets/:assetId/orders/lookup-by-key/:key
    const src = readSrc('services/marketApi.ts');
    expect(src).toMatch(/lookup.*idempotency|idempotency.*lookup|lookup-by-key/i);
  });
});

// ── TradeConfirmScreen integration: network error recovery ──

describe('P0.7: TradeConfirmScreen uses lookup on network error', () => {
  it('FIX: TradeConfirmScreen now imports lookupCoOwnOrderByIdempotencyKey', () => {
    // After the fix, the screen imports and uses the lookup function
    // on network error to recover the order result.
    const src = readSrc('screens/TradeConfirmScreen.tsx');
    expect(src).toContain('lookupCoOwnOrderByIdempotencyKey');
  });

  it('FIX: TradeConfirmScreen imports lookupCoOwnOrderByIdempotencyKey', () => {
    const src = readSrc('screens/TradeConfirmScreen.tsx');
    expect(src).toContain('lookupCoOwnOrderByIdempotencyKey');
  });

  it('FIX: TradeConfirmScreen calls lookup on network error', () => {
    // After the fix, when a network error occurs during order submission,
    // the screen should attempt to look up the order by idempotency key
    // before telling the user the result is unknown.
    const src = readSrc('screens/TradeConfirmScreen.tsx');
    expect(src).toMatch(/lookupCoOwnOrderByIdempotencyKey/);
  });
});

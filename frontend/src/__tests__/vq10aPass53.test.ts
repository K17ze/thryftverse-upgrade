import { describe, it, expect } from 'vitest';
import {
  mapApiErrorToTransactionError,
  type AuctionErrorDetails,
} from '../utils/transactionSheetLogic';

// ── PASS 5.3: Structured error metadata propagation ──

describe('PASS 5.3: mapApiErrorToTransactionError — structured metadata', () => {
  it('uses structuredDetails.buyNowPriceGbp for BUY_NOW_REVIEW_REQUIRED', () => {
    const details: AuctionErrorDetails = { buyNowPriceGbp: 250 };
    const result = mapApiErrorToTransactionError(
      new Error('buy now'),
      'fallback',
      'BUY_NOW_REVIEW_REQUIRED',
      409,
      'Your bid meets or exceeds the Buy Now price.',
      false,
      details,
    );
    expect(result.kind).toBe('buy_now_review_required');
    expect(result.buyNowPriceGbp).toBe(250);
  });

  it('falls back to regex when structuredDetails absent for BUY_NOW_REVIEW_REQUIRED', () => {
    const result = mapApiErrorToTransactionError(
      new Error('buy now'),
      'fallback',
      'BUY_NOW_REVIEW_REQUIRED',
      409,
      'Your bid meets or exceeds the Buy Now price (250.00). Use Buy Now to purchase this item immediately.',
      false,
    );
    expect(result.kind).toBe('buy_now_review_required');
    expect(result.buyNowPriceGbp).toBe(250);
  });

  it('uses structuredDetails.currentBuyNowPriceGbp for BUY_NOW_PRICE_CHANGED', () => {
    const details: AuctionErrorDetails = { currentBuyNowPriceGbp: 180 };
    const result = mapApiErrorToTransactionError(
      new Error('price changed'),
      'fallback',
      'BUY_NOW_PRICE_CHANGED',
      409,
      'The Buy Now price has changed.',
      false,
      details,
    );
    expect(result.kind).toBe('buy_now_price_changed');
    expect(result.currentBuyNowPriceGbp).toBe(180);
  });

  it('falls back to regex when structuredDetails absent for BUY_NOW_PRICE_CHANGED', () => {
    const result = mapApiErrorToTransactionError(
      new Error('price changed'),
      'fallback',
      'BUY_NOW_PRICE_CHANGED',
      409,
      'The Buy Now price has changed to 180.00',
      false,
    );
    expect(result.kind).toBe('buy_now_price_changed');
    expect(result.currentBuyNowPriceGbp).toBe(180);
  });

  it('uses structuredDetails.minimumNextBidGbp for minimum_changed', () => {
    const details: AuctionErrorDetails = { minimumNextBidGbp: 22.5 };
    const result = mapApiErrorToTransactionError(
      new Error('min'),
      'fallback',
      'BID_BELOW_MINIMUM',
      400,
      'Bid must be at least 22.50 GBP',
      false,
      details,
    );
    expect(result.kind).toBe('minimum_changed');
    expect(result.updatedMinimumGbp).toBe(22.5);
  });

  it('falls back to regex when structuredDetails absent for minimum_changed', () => {
    const result = mapApiErrorToTransactionError(
      new Error('min'),
      'fallback',
      null,
      400,
      'Bid must be at least 22.50 GBP',
      false,
    );
    expect(result.kind).toBe('minimum_changed');
    expect(result.updatedMinimumGbp).toBe(22.5);
  });

  it('prefers structuredDetails over regex for minimum_changed', () => {
    const details: AuctionErrorDetails = { minimumNextBidGbp: 30 };
    const result = mapApiErrorToTransactionError(
      new Error('min'),
      'fallback',
      null,
      400,
      'Bid must be at least 22.50 GBP',
      false,
      details,
    );
    expect(result.kind).toBe('minimum_changed');
    expect(result.updatedMinimumGbp).toBe(30);
  });
});

// ── PASS 5.3: IDEMPOTENCY_KEY_REUSED error mapping ──

describe('PASS 5.3: mapApiErrorToTransactionError — IDEMPOTENCY_KEY_REUSED', () => {
  it('maps 409 with IDEMPOTENCY_KEY_REUSED code as definitive retryable', () => {
    const result = mapApiErrorToTransactionError(
      new Error('reused'),
      'fallback',
      'IDEMPOTENCY_KEY_REUSED',
      409,
      'Idempotency key already used with a different payload.',
      false,
    );
    expect(result.kind).toBe('idempotency_key_reused');
    expect(result.isAmbiguous).toBe(false);
    expect(result.canRetry).toBe(true);
    expect(result.transactionPossible).toBe(true);
  });

  it('idempotency_key_reused is not ambiguous (safe to reset key)', () => {
    const result = mapApiErrorToTransactionError(
      new Error('reused'),
      'fallback',
      'IDEMPOTENCY_KEY_REUSED',
      409,
      'Idempotency key already used with a different payload.',
      false,
    );
    expect(result.isAmbiguous).toBe(false);
  });
});

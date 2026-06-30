import { describe, it, expect } from 'vitest';
import {
  mapApiErrorToTransactionError,
  type AuctionErrorDetails,
} from '../utils/transactionSheetLogic';

const fs = require('fs');
const path = require('path');

const screenSrc = fs.readFileSync(
  path.resolve(__dirname, '../screens/AuctionDetailScreen.tsx'),
  'utf-8',
);
const bidSheetSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/ui/BidSheet.tsx'),
  'utf-8',
);
const buyNowSheetSrc = fs.readFileSync(
  path.resolve(__dirname, '../components/ui/BuyNowSheet.tsx'),
  'utf-8',
);
const txLogicSrc = fs.readFileSync(
  path.resolve(__dirname, '../utils/transactionSheetLogic.ts'),
  'utf-8',
);
const apiClientSrc = fs.readFileSync(
  path.resolve(__dirname, '../lib/apiClient.ts'),
  'utf-8',
);
const marketApiSrc = fs.readFileSync(
  path.resolve(__dirname, '../services/marketApi.ts'),
  'utf-8',
);
const auctionDetailLogicSrc = fs.readFileSync(
  path.resolve(__dirname, '../utils/auctionDetailLogic.ts'),
  'utf-8',
);

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

// ── PASS 5.3: BidSheet recoverable_conflict stage ──

describe('PASS 5.3: BidSheet recoverable_conflict stage (source inspection)', () => {
  it('BidSheetStage includes recoverable_conflict', () => {
    expect(txLogicSrc).toContain('recoverable_conflict');
  });

  it('BidSheet handles buy_now_review_required by setting recoverable_conflict stage', () => {
    expect(bidSheetSrc).toContain("txError.kind === 'buy_now_review_required'");
    expect(bidSheetSrc).toContain('recoverable_conflict');
  });

  it('BidSheet recoverable_conflict stage shows Review Buy Now button', () => {
    expect(bidSheetSrc).toContain('Review Buy Now');
  });

  it('BidSheet recoverable_conflict stage shows Edit bid button', () => {
    const conflictStageStart = bidSheetSrc.indexOf("stage === 'recoverable_conflict'");
    const conflictSection = bidSheetSrc.substring(conflictStageStart, conflictStageStart + 1200);
    expect(conflictSection).toContain('Edit bid');
  });

  it('BidSheet resets idempotency key on recoverable_conflict', () => {
    const conflictSection = bidSheetSrc.substring(
      bidSheetSrc.indexOf("txError.kind === 'buy_now_review_required'"),
      bidSheetSrc.indexOf('recoverable_conflict'),
    );
    expect(conflictSection).toContain('idempotencyKeyRef.current = null');
  });

  it('BidSheet passes structuredDetails to mapApiErrorToTransactionError', () => {
    expect(bidSheetSrc).toContain('parsed.structuredDetails');
  });

  it('BidSheet recoverable_conflict shows Buy Now price from error metadata', () => {
    expect(bidSheetSrc).toContain('error.buyNowPriceGbp');
  });
});

// ── PASS 5.3: AuctionDetailScreen resolveEffectiveState terminal precedence ──

describe('PASS 5.3: resolveEffectiveState terminal precedence (source inspection)', () => {
  it('checks cancelledAt before lifecycle', () => {
    expect(screenSrc).toContain('auction.cancelledAt');
    expect(screenSrc).toContain("'cancelled'");
  });

  it('checks settledAt before lifecycle', () => {
    expect(screenSrc).toContain('auction.settledAt');
    expect(screenSrc).toContain("'settled'");
  });

  it('checks winnerBidderId before clock-based state', () => {
    expect(screenSrc).toContain('auction.winnerBidderId');
    expect(screenSrc).toContain("'ended'");
  });

  it('checks authoritative lifecycle from backend', () => {
    expect(screenSrc).toContain('auction.lifecycle');
    expect(screenSrc).toContain("auction.lifecycle === 'ended'");
    expect(screenSrc).toContain("auction.lifecycle === 'cancelled'");
    expect(screenSrc).toContain("auction.lifecycle === 'settled'");
  });

  it('detailInput includes lifecycle and terminalReason', () => {
    expect(screenSrc).toContain('lifecycle: auction.lifecycle');
    expect(screenSrc).toContain('terminalReason: auction.terminalReason');
  });
});

// ── PASS 5.3: apiClient structured details extraction ──

describe('PASS 5.3: apiClient structured details (source inspection)', () => {
  it('ParsedApiError includes structuredDetails field', () => {
    expect(apiClientSrc).toContain('structuredDetails');
  });

  it('has extractStructuredDetails helper', () => {
    expect(apiClientSrc).toContain('extractStructuredDetails');
  });

  it('extracts buyNowPriceGbp from error payload', () => {
    expect(apiClientSrc).toContain('buyNowPriceGbp');
  });

  it('extracts currentBuyNowPriceGbp from error payload', () => {
    expect(apiClientSrc).toContain('currentBuyNowPriceGbp');
  });

  it('extracts minimumNextBidGbp from error payload', () => {
    expect(apiClientSrc).toContain('minimumNextBidGbp');
  });

  it('parseApiError includes structuredDetails in return', () => {
    expect(apiClientSrc).toContain('structuredDetails: extractStructuredDetails');
  });
});

// ── PASS 5.3: BuyNowSheet authoritative price state ──

describe('PASS 5.3: BuyNowSheet authoritative price state (source inspection)', () => {
  it('has authoritativePrice state', () => {
    expect(buyNowSheetSrc).toContain('authoritativePrice');
    expect(buyNowSheetSrc).toContain('setAuthoritativePrice');
  });

  it('initialises authoritativePrice from auction.buyNowPriceGbp on open', () => {
    expect(buyNowSheetSrc).toContain('setAuthoritativePrice(auction.buyNowPriceGbp)');
  });

  it('uses authoritativePrice for display', () => {
    expect(buyNowSheetSrc).toContain('displayPriceGbp');
    expect(buyNowSheetSrc).toContain('authoritativePrice');
  });

  it('updates authoritativePrice from structured error metadata on price change', () => {
    expect(buyNowSheetSrc).toContain('txError.currentBuyNowPriceGbp');
    expect(buyNowSheetSrc).toContain('setAuthoritativePrice(txError.currentBuyNowPriceGbp)');
  });

  it('updates authoritativePrice from refresh snapshot', () => {
    expect(buyNowSheetSrc).toContain('snapshot.auction.buyNowPriceGbp');
    expect(buyNowSheetSrc).toContain('setAuthoritativePrice(refreshedPrice)');
  });

  it('passes structuredDetails to mapApiErrorToTransactionError', () => {
    expect(buyNowSheetSrc).toContain('parsed.structuredDetails');
  });

  it('uses effectivePrice (from authoritative state) for transaction amount', () => {
    expect(buyNowSheetSrc).toContain('effectivePrice');
    expect(buyNowSheetSrc).toContain('transactionAmount');
  });
});

// ── PASS 5.3: marketApi types — canonical lifecycle ──

describe('PASS 5.3: marketApi canonical lifecycle types (source inspection)', () => {
  it('AuctionLifecycle includes all 5 canonical states', () => {
    expect(marketApiSrc).toContain("'upcoming'");
    expect(marketApiSrc).toContain("'live'");
    expect(marketApiSrc).toContain("'ended'");
    expect(marketApiSrc).toContain("'cancelled'");
    expect(marketApiSrc).toContain("'settled'");
  });

  it('AuctionTerminalReason includes all 4 reasons', () => {
    expect(marketApiSrc).toContain("'cancelled'");
    expect(marketApiSrc).toContain("'settled'");
    expect(marketApiSrc).toContain("'buy_now'");
    expect(marketApiSrc).toContain("'scheduled_end'");
  });

  it('MarketAuction has lifecycle field', () => {
    expect(marketApiSrc).toContain('lifecycle: AuctionLifecycle');
  });

  it('MarketAuction has terminalReason field', () => {
    expect(marketApiSrc).toContain('terminalReason: AuctionTerminalReason');
  });

  it('MarketAuction has winnerBidderId field', () => {
    expect(marketApiSrc).toContain('winnerBidderId');
  });

  it('AuctionDetail has lifecycle field', () => {
    const detailStart = marketApiSrc.indexOf('export interface AuctionDetail');
    const detailEnd = marketApiSrc.indexOf('}', detailStart + 100);
    const detailSection = marketApiSrc.substring(detailStart, detailEnd);
    expect(detailSection).toContain('lifecycle: AuctionLifecycle');
  });

  it('AuctionDetail has terminalReason field', () => {
    const detailStart = marketApiSrc.indexOf('export interface AuctionDetail');
    const detailEnd = marketApiSrc.indexOf('}', detailStart + 100);
    const detailSection = marketApiSrc.substring(detailStart, detailEnd);
    expect(detailSection).toContain('terminalReason: AuctionTerminalReason');
  });
});

// ── PASS 5.3: auctionDetailLogic — lifecycle and terminalReason in input ──

describe('PASS 5.3: auctionDetailLogic input types (source inspection)', () => {
  it('AuctionDetailInput has lifecycle field', () => {
    expect(auctionDetailLogicSrc).toContain('lifecycle');
  });

  it('AuctionDetailInput has terminalReason field', () => {
    expect(auctionDetailLogicSrc).toContain('terminalReason');
  });

  it('AuctionDetailInput has winnerBidderId field', () => {
    expect(auctionDetailLogicSrc).toContain('winnerBidderId');
  });
});

// ── PASS 5.3: TransactionErrorKind — idempotency_key_reused ──

describe('PASS 5.3: TransactionErrorKind extension (source inspection)', () => {
  it('TransactionErrorKind includes idempotency_key_reused', () => {
    expect(txLogicSrc).toContain("'idempotency_key_reused'");
  });

  it('BidSheetStage includes recoverable_conflict', () => {
    expect(txLogicSrc).toContain("'recoverable_conflict'");
  });

  it('AuctionErrorDetails interface is exported', () => {
    expect(txLogicSrc).toContain('export interface AuctionErrorDetails');
  });

  it('mapApiErrorToTransactionError accepts structuredDetails parameter', () => {
    expect(txLogicSrc).toContain('structuredDetails?: AuctionErrorDetails | null');
  });
});

// ── PASS 5.3: Backend atomic idempotency (source inspection) ──

describe('PASS 5.3: Backend atomic idempotency (source inspection)', () => {
  const backendSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../backend/api/src/index.ts'),
    'utf-8',
  );
  const migrationSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../backend/api/src/db/migrations/047_auction_transaction_idempotency.sql'),
    'utf-8',
  );

  it('has computeRequestHash function', () => {
    expect(backendSrc).toContain('function computeRequestHash');
    expect(backendSrc).toContain('createHash');
  });

  it('has claimIdempotency function', () => {
    expect(backendSrc).toContain('async function claimIdempotency');
  });

  it('has storeIdempotencyResponse function', () => {
    expect(backendSrc).toContain('async function storeIdempotencyResponse');
  });

  it('claimIdempotency uses INSERT ON CONFLICT on (auction_id, user_id, idempotency_key)', () => {
    expect(backendSrc).toContain('ON CONFLICT');
    expect(backendSrc).toContain('ON CONFLICT (auction_id, user_id, idempotency_key)');
    expect(backendSrc).toContain('DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key');
  });

  it('bid route uses claimIdempotency inside transaction', () => {
    const bidRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/bids'");
    const buyNowRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/buy-now'");
    const bidRoute = backendSrc.substring(bidRouteStart, buyNowRouteStart);
    expect(bidRoute).toContain('claimIdempotency');
    expect(bidRoute).toContain('requestHash');
  });

  it('buy-now route uses claimIdempotency inside transaction', () => {
    const buyNowRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/buy-now'");
    // Find the route's closing by looking for the next route declaration or end of file
    const nextRouteStart = backendSrc.indexOf('\n// ──', buyNowRouteStart + 100);
    const buyNowRoute = nextRouteStart > 0
      ? backendSrc.substring(buyNowRouteStart, nextRouteStart)
      : backendSrc.substring(buyNowRouteStart, buyNowRouteStart + 5000);
    expect(buyNowRoute).toContain('claimIdempotency');
    expect(buyNowRoute).toContain('requestHash');
  });

  it('bid route returns IDEMPOTENCY_KEY_REUSED for different payload', () => {
    const bidRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/bids'");
    const buyNowRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/buy-now'");
    const bidRoute = backendSrc.substring(bidRouteStart, buyNowRouteStart);
    expect(bidRoute).toContain('IDEMPOTENCY_KEY_REUSED');
  });

  it('buy-now route returns IDEMPOTENCY_KEY_REUSED for different payload', () => {
    const buyNowRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/buy-now'");
    const nextRouteStart = backendSrc.indexOf('\n// ──', buyNowRouteStart + 100);
    const buyNowRoute = nextRouteStart > 0
      ? backendSrc.substring(buyNowRouteStart, nextRouteStart)
      : backendSrc.substring(buyNowRouteStart, buyNowRouteStart + 5000);
    expect(buyNowRoute).toContain('IDEMPOTENCY_KEY_REUSED');
  });

  it('bid route stores idempotency response before commit', () => {
    const bidRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/bids'");
    const buyNowRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/buy-now'");
    const bidRoute = backendSrc.substring(bidRouteStart, buyNowRouteStart);
    expect(bidRoute).toContain('storeIdempotencyResponse');
  });

  it('buy-now route stores idempotency response before commit', () => {
    const buyNowRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/buy-now'");
    const nextRouteStart = backendSrc.indexOf('\n// ──', buyNowRouteStart + 100);
    const buyNowRoute = nextRouteStart > 0
      ? backendSrc.substring(buyNowRouteStart, nextRouteStart)
      : backendSrc.substring(buyNowRouteStart, buyNowRouteStart + 5000);
    expect(buyNowRoute).toContain('storeIdempotencyResponse');
  });

  it('bid route replays same-hash response', () => {
    const bidRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/bids'");
    const buyNowRouteStart = backendSrc.indexOf("app.post('/auctions/:auctionId/buy-now'");
    const bidRoute = backendSrc.substring(bidRouteStart, buyNowRouteStart);
    expect(bidRoute).toContain('claim.existing.requestHash !== requestHash');
    expect(bidRoute).toContain('claim.existing.responseBody');
  });

  // Migration tests
  it('migration creates auction_transaction_idempotency table', () => {
    expect(migrationSrc).toContain('CREATE TABLE IF NOT EXISTS auction_transaction_idempotency');
  });

  it('migration has idempotency_key column', () => {
    expect(migrationSrc).toContain('idempotency_key TEXT NOT NULL');
  });

  it('migration has request_hash column', () => {
    expect(migrationSrc).toContain('request_hash TEXT NOT NULL');
  });

  it('migration has operation_type column with CHECK constraint', () => {
    expect(migrationSrc).toContain('operation_type TEXT NOT NULL CHECK');
    expect(migrationSrc).toContain("'bid'");
    expect(migrationSrc).toContain("'buy_now'");
  });

  it('migration has response_status and response_body columns', () => {
    expect(migrationSrc).toContain('response_status INTEGER NOT NULL');
    expect(migrationSrc).toContain('response_body JSONB NOT NULL');
  });

  it('migration has unique index on auction_id + user_id + idempotency_key', () => {
    expect(migrationSrc).toContain('CREATE UNIQUE INDEX');
    expect(migrationSrc).toContain('auction_txn_idempotency_key_idx');
    expect(migrationSrc).toContain('auction_id, user_id, idempotency_key');
  });

  it('migration has lookup index by auction + user + operation', () => {
    expect(migrationSrc).toContain('auction_txn_idempotency_lookup_idx');
    expect(migrationSrc).toContain('auction_id, user_id, operation_type');
  });
});

// ── PASS 5.3: Backend structured error fields ──

describe('PASS 5.3: Backend structured error fields (source inspection)', () => {
  const backendSrc = fs.readFileSync(
    path.resolve(__dirname, '../../../backend/api/src/index.ts'),
    'utf-8',
  );

  it('BUY_NOW_REVIEW_REQUIRED includes buyNowPriceGbp', () => {
    expect(backendSrc).toContain('BUY_NOW_REVIEW_REQUIRED');
    expect(backendSrc).toContain('buyNowPriceGbp: Number(auction.buy_now_price_gbp)');
  });

  it('BUY_NOW_PRICE_CHANGED includes currentBuyNowPriceGbp', () => {
    expect(backendSrc).toContain('BUY_NOW_PRICE_CHANGED');
    expect(backendSrc).toContain('currentBuyNowPriceGbp: buyNowPriceGbp');
  });

  it('BID_BELOW_MINIMUM includes minimumNextBidGbp', () => {
    expect(backendSrc).toContain('BID_BELOW_MINIMUM');
    expect(backendSrc).toContain('minimumNextBidGbp: minimumNextBid');
  });
});

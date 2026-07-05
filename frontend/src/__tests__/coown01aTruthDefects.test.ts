import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTradeQuote,
  CO_OWN_FEE_RATE,
} from '../utils/tradeFlow';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..');

function readSrc(rel: string): string {
  return readFileSync(join(srcDir, rel), 'utf-8');
}

const ELIGIBLE = { ok: true };

// ── 1. Money semantics: buy total = gross + fee, sell proceeds = gross - fee ──

describe('COOWN-01A: trade quote money semantics', () => {
  it('buy quote netValue = gross + fee (total cost)', () => {
    const quote = buildTradeQuote({
      orderMode: 'market',
      side: 'buy',
      quantityInput: '5',
      limitPriceInput: '',
      marketPrice: 10, // GBP
    });

    expect(quote.grossValue).toBe(50); // 5 × 10
    expect(quote.fee).toBe(50 * CO_OWN_FEE_RATE);
    expect(quote.netValue).toBe(quote.grossValue + quote.fee); // total cost
  });

  it('sell quote netValue = gross - fee (net proceeds)', () => {
    const quote = buildTradeQuote({
      orderMode: 'market',
      side: 'sell',
      quantityInput: '5',
      limitPriceInput: '',
      marketPrice: 10, // GBP
    });

    expect(quote.grossValue).toBe(50); // 5 × 10
    expect(quote.fee).toBe(50 * CO_OWN_FEE_RATE);
    expect(quote.netValue).toBe(quote.grossValue - quote.fee); // net proceeds, NOT gross + fee
  });

  it('buy and sell netValue are different (fee added vs subtracted)', () => {
    const buyQuote = buildTradeQuote({
      orderMode: 'market', side: 'buy', quantityInput: '3', limitPriceInput: '', marketPrice: 5,
    });
    const sellQuote = buildTradeQuote({
      orderMode: 'market', side: 'sell', quantityInput: '3', limitPriceInput: '', marketPrice: 5,
    });

    expect(buyQuote.netValue).toBeGreaterThan(sellQuote.netValue);
    expect(buyQuote.netValue).toBe(sellQuote.grossValue + sellQuote.fee);
    expect(sellQuote.netValue).toBe(sellQuote.grossValue - sellQuote.fee);
  });
});

// ── 2. No client-invented execution adjustment ──

describe('COOWN-01A: no client-invented execution adjustment', () => {
  it('market order executionPrice = marketPrice (no ±0.3% adjustment)', () => {
    const buyQuote = buildTradeQuote({
      orderMode: 'market', side: 'buy', quantityInput: '1', limitPriceInput: '', marketPrice: 7.5,
    });
    const sellQuote = buildTradeQuote({
      orderMode: 'market', side: 'sell', quantityInput: '1', limitPriceInput: '', marketPrice: 7.5,
    });

    // Previously: buy used marketPrice * 1.003, sell used marketPrice * 0.997
    expect(buyQuote.executionPrice).toBe(7.5);
    expect(sellQuote.executionPrice).toBe(7.5);
  });

  it('tradeFlow source has no 1.003 or 0.997 slippage factors', () => {
    const source = readSrc('utils/tradeFlow.ts');
    expect(source).not.toContain('1.003');
    expect(source).not.toContain('0.997');
  });
});

// ── 3. GBP limit price remains GBP end to end ──

describe('COOWN-01A: GBP limit price contract', () => {
  it('limit order executionPrice = entered limit price (GBP)', () => {
    const quote = buildTradeQuote({
      orderMode: 'limit',
      side: 'buy',
      quantityInput: '3',
      limitPriceInput: '9.50',
      marketPrice: 10,
    });

    // The limit price the user entered is the execution price — no conversion
    expect(quote.limitPrice).toBe(9.5);
    expect(quote.executionPrice).toBe(9.5);
    expect(quote.grossValue).toBe(3 * 9.5);
  });

  it('TradeScreen passes asset.unitPriceGbp (GBP) as marketPrice, not toIze', () => {
    const source = readSrc('screens/TradeScreen.tsx');
    // The old code converted: toIze(asset.unitPriceGbp, 'GBP', goldRates)
    // The new code should use asset.unitPriceGbp directly
    expect(source).not.toMatch(/toIze\(asset\.unitPriceGbp/);
  });

  it('TradeScreen sends quote.limitPrice as limitPriceGbp (already GBP)', () => {
    const source = readSrc('screens/TradeScreen.tsx');
    expect(source).toContain('limitPriceGbp:');
    // Should not convert the limit price through toIze before sending
    expect(source).not.toMatch(/toIze.*quote\.limitPrice/);
  });
});

// ── 4. No u1 or fabricated actor ID fallback ──

describe('COOWN-01A: no fabricated actor identity', () => {
  it('TradeConfirmScreen has no u1 fallback', () => {
    const source = readSrc('screens/TradeConfirmScreen.tsx');
    expect(source).not.toContain("?? 'u1'");
    expect(source).not.toContain('actingUserId');
  });

  it('BuyoutScreen has no u1 fallback', () => {
    const source = readSrc('screens/BuyoutScreen.tsx');
    expect(source).not.toContain("?? 'u1'");
    expect(source).not.toContain('bidderUserId = currentUser?.id ??');
  });

  it('TradeConfirmScreen blocks submission when not authenticated', () => {
    const source = readSrc('screens/TradeConfirmScreen.tsx');
    expect(source).toContain("currentUser?.id");
    expect(source).toMatch(/Sign in.*required|not.*authenticated/i);
  });
});

// ── 5. Order status mapping preserves exact statuses ──

describe('COOWN-01A: order status preservation', () => {
  it('SyndicateOrderHistoryScreen does not map open/partial/cancelled to filled', () => {
    const source = readSrc('screens/SyndicateOrderHistoryScreen.tsx');
    // The old buggy mapping: item.status === 'filled' ? 'filled' : item.status === 'rejected' ? 'cancelled' : 'filled'
    // This mapped everything except rejected to filled
    expect(source).not.toMatch(/status === 'rejected' \? 'cancelled' : 'filled'/);
  });

  it('SyndicateOrderHistoryScreen preserves all five backend statuses', () => {
    const source = readSrc('screens/SyndicateOrderHistoryScreen.tsx');
    expect(source).toContain("'open'");
    expect(source).toContain("'partially_filled'");
    expect(source).toContain("'filled'");
    expect(source).toContain("'cancelled'");
    expect(source).toContain("'rejected'");
  });

  it('OrderHistoryRow supports all five real statuses', () => {
    const source = readSrc('components/trade/OrderHistoryRow.tsx');
    expect(source).toContain("'open'");
    expect(source).toContain("'partially_filled'");
    expect(source).toContain("'filled'");
    expect(source).toContain("'cancelled'");
    expect(source).toContain("'rejected'");
    // Should NOT contain the old 'pending' or 'partial' statuses
    expect(source).not.toMatch("'pending'");
    expect(source).not.toMatch("'partial'");
  });
});

// ── 6. No fake report success ──

describe('COOWN-01A: no fake support report success', () => {
  it('CoOwnIssueScreen has no setTimeout simulated submission', () => {
    const source = readSrc('screens/CoOwnIssueScreen.tsx');
    expect(source).not.toContain('setTimeout');
  });

  it('CoOwnIssueScreen does not show "Report recorded" success state', () => {
    const source = readSrc('screens/CoOwnIssueScreen.tsx');
    expect(source).not.toContain('Report recorded');
    expect(source).not.toContain('setSubmitted');
  });

  it('CoOwnIssueScreen routes to HelpSupport instead of fake local recording', () => {
    const source = readSrc('screens/CoOwnIssueScreen.tsx');
    expect(source).toContain("navigation.navigate('HelpSupport')");
  });
});

// ── 7. No fabricated conversation IDs ──

describe('COOWN-01A: no fabricated conversation IDs', () => {
  it('AssetDetailScreen does not fabricate conversationId from issuerId_listingId', () => {
    const source = readSrc('screens/AssetDetailScreen.tsx');
    expect(source).not.toMatch(/conversationId.*\$\{.*issuerId.*\}.*\$\{.*listingId.*\}/);
  });

  it('coOwnMessaging helper uses real createGroupConversationOnApi', () => {
    const source = readSrc('utils/coOwnMessaging.ts');
    expect(source).toContain('createGroupConversationOnApi');
    expect(source).toContain('idempotencyKey');
  });

  it('AssetDetailScreen uses resolveCoOwnConversation', () => {
    const source = readSrc('screens/AssetDetailScreen.tsx');
    expect(source).toContain('resolveCoOwnConversation');
  });
});

// ── 8. No issuer-listing fallback to other users' listings ──

describe('COOWN-01A: no issuer-listing fallback', () => {
  it('CreateSyndicateScreen does not fall back to other users\' listings', () => {
    const source = readSrc('screens/CreateSyndicateScreen.tsx');
    // The old fallback: return own.length ? own : sourceListings.slice(0, 12)
    expect(source).not.toMatch(/sourceListings\.slice\(0,\s*12\)/);
    expect(source).not.toMatch(/own\.length \? own :/);
  });

  it('CreateSyndicateScreen filters only by sellerId === issuerId', () => {
    const source = readSrc('screens/CreateSyndicateScreen.tsx');
    expect(source).toContain('sellerId === issuerId');
  });

  it('CreateSyndicateScreen sends issuerId in createCoOwnAsset call', () => {
    const source = readSrc('screens/CreateSyndicateScreen.tsx');
    expect(source).toContain('issuerId,');
  });
});

// ── 9. Buyout does not fake "Claim Full Ownership" success ──

describe('COOWN-01A: buyout truth', () => {
  it('BuyoutScreen does not show "Claim Full Ownership" as a success action', () => {
    const source = readSrc('screens/BuyoutScreen.tsx');
    expect(source).not.toContain('Claim Full Ownership');
  });

  it('BuyoutScreen shows honest unavailable state instead of fake lifecycle', () => {
    const source = readSrc('screens/BuyoutScreen.tsx');
    // Backend only supports createCoOwnBuyoutOffer — no accept/reject/cancel/list.
    // The screen must NOT show a fake transactional flow with hardcoded premium.
    expect(source).not.toContain('1.08');
    expect(source).not.toContain('expiresInHours: 24');
    expect(source).not.toContain('Initiate Buyout');
    expect(source).toContain('not available');
  });

  it('BuyoutScreen does not navigate away as success when sharesNeeded <= 0', () => {
    const source = readSrc('screens/BuyoutScreen.tsx');
    // The old code called navigation.navigate('AssetDetail', ...) as if a transition occurred
    // The new code should show an info toast and return, not navigate
    expect(source).not.toMatch(/sharesNeeded <= 0.*navigation\.navigate/);
  });
});

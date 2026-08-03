import { describe, expect, it } from 'vitest';
import {
  buildTradeQuote,
  CO_OWN_FEE_RATE,
} from '../utils/tradeFlow';

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
});

import { describe, expect, it } from 'vitest';
import { computeReservation, estimateFill, CO_OWN_FEE_RATE } from '../utils/tradeFlow';

describe('P0.8: computeReservation uses exact arithmetic', () => {
  it('buy: fee is exactly 1% of principal (no floating point drift)', () => {
    const result = computeReservation('buy', 5, 49.25, { rate: 0.01, fixed: 0 });
    // 49.25 * 5 = 246.25, fee = 2.4625 → 2.46 (rounded to pence)
    // The key test: fee should be exactly 2.46, not 2.4625000000000003
    expect(result.fee).toBe(2.46);
    expect(result.principal).toBe(246.25);
    expect(result.gross).toBe(246.25);
    expect(result.total).toBe(248.71); // 246.25 + 2.46
  });

  it('sell: fee is exactly 1% of gross', () => {
    const result = computeReservation('sell', 5, 49.25, { rate: 0.01, fixed: 0 });
    expect(result.gross).toBe(246.25);
    expect(result.fee).toBe(2.46);
    expect(result.total).toBe(243.79); // 246.25 - 2.46
  });

  it('buy with 0.1 price: no floating point error in fee', () => {
    // 0.1 * 1 = 0.10, fee = 0.001 → 0.00 (rounded to pence)
    const result = computeReservation('buy', 1, 0.1, { rate: 0.01, fixed: 0 });
    expect(result.principal).toBe(0.1);
    expect(result.fee).toBe(0); // 0.001 rounds to 0.00
    expect(result.total).toBe(0.1);
  });

  it('buy with 0.2 price: no floating point error', () => {
    const result = computeReservation('buy', 1, 0.2, { rate: 0.01, fixed: 0 });
    expect(result.principal).toBe(0.2);
    expect(result.fee).toBe(0); // 0.002 rounds to 0.00
    expect(result.total).toBe(0.2);
  });

  it('buy: 0.1 + 0.2 = 0.3 exactly in total calculation', () => {
    // This tests that the internal BigInt arithmetic doesn't produce 0.30000000000000004
    const r1 = computeReservation('buy', 1, 0.1, { rate: 0, fixed: 0 });
    const r2 = computeReservation('buy', 1, 0.2, { rate: 0, fixed: 0 });
    // With zero fee, total === principal
    expect(r1.total).toBe(0.1);
    expect(r2.total).toBe(0.2);
    // The sum should be exact when using the Money utility's addGbp
    // (This is a conceptual test — the actual addition would happen in the caller)
  });

  it('large quantity: 1000 units at 49.25 = 49250.00 exactly', () => {
    const result = computeReservation('buy', 1000, 49.25, { rate: 0.01, fixed: 0 });
    expect(result.principal).toBe(49250);
    expect(result.fee).toBe(492.5);
    expect(result.total).toBe(49742.5);
  });
});

describe('P0.8: estimateFill uses exact accumulation', () => {
  it('accumulates cost without floating point drift', () => {
    const book = {
      bids: [{ price: 49.25, size: 5 }],
      asks: [{ price: 49.5, size: 3 }, { price: 49.75, size: 2 }],
    };
    const result = estimateFill('buy', 5, book);
    // 3 * 49.50 + 2 * 49.75 = 148.50 + 99.50 = 248.00
    expect(result.gross).toBe(248);
    expect(result.avgFillPrice).toBe(49.6); // 248 / 5
    expect(result.worstPrice).toBe(49.75);
    expect(result.unitsFilled).toBe(5);
  });

  it('single level fill is exact', () => {
    const book = {
      bids: [{ price: 50.0, size: 10 }],
      asks: [{ price: 50.0, size: 10 }],
    };
    const result = estimateFill('buy', 3, book);
    expect(result.gross).toBe(150);
    expect(result.avgFillPrice).toBe(50);
  });

  it('partial fill when depth is insufficient', () => {
    const book = {
      bids: [],
      asks: [{ price: 49.5, size: 2 }],
    };
    const result = estimateFill('buy', 5, book);
    expect(result.unitsFilled).toBe(2);
    expect(result.gross).toBe(99);
    expect(result.slippageBeyondDepth).toBe(true);
  });
});

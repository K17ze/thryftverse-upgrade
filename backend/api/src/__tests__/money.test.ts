import { describe, expect, it } from 'vitest';
import { formatGbp, formatGbp2, parseGbp, round4, round2, calculateFee, calculateTotal } from '../lib/moneyFormat.js';

describe('P0.8: Backend money utilities', () => {
  it('formatGbp: 49.25 → "49.2500"', () => {
    expect(formatGbp(49.25)).toBe('49.2500');
  });

  it('formatGbp: null → "0.0000"', () => {
    expect(formatGbp(null)).toBe('0.0000');
  });

  it('formatGbp: undefined → "0.0000"', () => {
    expect(formatGbp(undefined)).toBe('0.0000');
  });

  it('formatGbp: string "49.25" → "49.2500"', () => {
    expect(formatGbp('49.25')).toBe('49.2500');
  });

  it('formatGbp2: 49.25 → "49.25"', () => {
    expect(formatGbp2(49.25)).toBe('49.25');
  });

  it('parseGbp: "49.25" → 49.25', () => {
    expect(parseGbp('49.25')).toBe(49.25);
  });

  it('parseGbp: 49.25 (number) → 49.25', () => {
    expect(parseGbp(49.25)).toBe(49.25);
  });

  it('round4: 49.25999 → 49.26', () => {
    expect(round4(49.25999)).toBe(49.26);
  });

  it('round2: 49.259 → 49.26', () => {
    expect(round2(49.259)).toBe(49.26);
  });

  it('calculateFee: 1% of 246.25 = 2.4625', () => {
    expect(calculateFee(246.25, 0.01)).toBe(2.4625);
  });

  it('calculateTotal: buy 246.25 + 2.4625 fee = 248.7125', () => {
    expect(calculateTotal(246.25, 2.4625, 'buy')).toBe(248.7125);
  });

  it('calculateTotal: sell 246.25 - 2.4625 fee = 243.7875', () => {
    expect(calculateTotal(246.25, 2.4625, 'sell')).toBe(243.7875);
  });
});

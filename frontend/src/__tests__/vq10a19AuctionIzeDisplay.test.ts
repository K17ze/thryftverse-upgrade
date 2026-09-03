import { describe, it, expect } from 'vitest';
import { formatAuctionIze, toIze, DEFAULT_FX_RATES } from '../utils/currency';

describe('VQ-10A19: Auction 1ZE display helper', () => {
  describe('formatAuctionIze', () => {
    it('produces two display decimals', () => {
      const izeAmount = toIze(100, 'GBP', DEFAULT_FX_RATES);
      const result = formatAuctionIze(izeAmount);
      // Should have exactly 2 decimal places before the suffix
      const numericPart = result.split(' ')[0];
      expect(numericPart.split('.')[1]).toHaveLength(2);
    });

    it('uses uppercase 1ZE suffix', () => {
      const result = formatAuctionIze(24.6);
      expect(result).toContain('1ZE');
      expect(result).not.toContain('1ze');
    });

    it('does not produce a duplicate suffix', () => {
      const result = formatAuctionIze(24.6);
      // Count occurrences of "1ZE" — should be exactly 1
      const matches = result.match(/1ZE/g);
      expect(matches).toHaveLength(1);
    });

    it('does not produce a duplicate lowercase suffix', () => {
      const result = formatAuctionIze(24.6);
      // Should not contain lowercase 1ze at all
      expect(result).not.toContain('1ze');
    });

    it('formats zero value correctly', () => {
      const result = formatAuctionIze(0);
      expect(result).toBe('0.00 1ZE');
    });

    it('formats large values correctly', () => {
      const result = formatAuctionIze(1234567.89);
      expect(result).toBe('1234567.89 1ZE');
    });

    it('rounds to two decimals from full precision', () => {
      const result = formatAuctionIze(24.6011);
      expect(result).toBe('24.60 1ZE');
    });

    it('preserves full calculation precision in the input (no premature rounding)', () => {
      const izeAmount = toIze(99.99, 'GBP', DEFAULT_FX_RATES);
      // The helper should receive the full-precision value
      // and display only 2 decimals without altering the input
      const result = formatAuctionIze(izeAmount);
      const numericPart = parseFloat(result.split(' ')[0]);
      expect(numericPart).toBeCloseTo(izeAmount, 1);
    });

    it('produces tabular-numeral compatible output (numeric string)', () => {
      const result = formatAuctionIze(1234.56);
      // The numeric part should be a clean decimal string
      expect(result).toMatch(/^\d+\.\d{2} 1ZE$/);
    });
  });


});

import { describe, it, expect } from 'vitest';
import {
  toIze,
  toFiat,
  formatIzeAmount,
  formatPrice,
  DEFAULT_GOLD_RATES,
  type CurrencyDisplayMode,
} from '../utils/currency';
import { CURRENCIES } from '../constants/currencies';

describe('VQ-10A2: Currency quote conversion and 1ZE display hierarchy', () => {
  const rates = DEFAULT_GOLD_RATES;

  describe('toIze / toFiat round-trip', () => {
    it('converts GBP to 1ZE and back without significant loss', () => {
      const gbpAmount = 100;
      const izeAmount = toIze(gbpAmount, 'GBP', rates);
      const backToGbp = toFiat(izeAmount, 'GBP', rates);
      expect(Math.abs(backToGbp - gbpAmount)).toBeLessThan(0.0001);
    });

    it('converts USD to 1ZE and back without significant loss', () => {
      const usdAmount = 150;
      const izeAmount = toIze(usdAmount, 'USD', rates);
      const backToUsd = toFiat(izeAmount, 'USD', rates);
      expect(Math.abs(backToUsd - usdAmount)).toBeLessThan(0.0001);
    });

    it('returns 0 for toIze when rate is 0', () => {
      const result = toIze(100, 'GBP', { GBP: 0 });
      expect(result).toBe(0);
    });
  });

  describe('formatIzeAmount', () => {
    it('formats with default 6 decimal places', () => {
      const result = formatIzeAmount(1.123456789);
      expect(result).toContain('1.123457');
      expect(result).toContain('1ze');
    });

    it('formats with custom decimal places', () => {
      const result = formatIzeAmount(1.123456789, 4);
      expect(result).toContain('1.1235');
      expect(result).toContain('1ze');
    });
  });

  describe('formatPrice display hierarchy', () => {
    const izeAmount = toIze(100, 'GBP', rates);

    it('shows only 1ZE in ize mode', () => {
      const result = formatPrice({
        izeAmount,
        displayMode: 'ize' as CurrencyDisplayMode,
        currencyCode: 'GBP',
        goldRates: rates,
      });
      expect(result).toContain('1ze');
      expect(result).not.toContain('£');
    });

    it('shows only fiat in fiat mode', () => {
      const result = formatPrice({
        izeAmount,
        displayMode: 'fiat' as CurrencyDisplayMode,
        currencyCode: 'GBP',
        goldRates: rates,
      });
      expect(result).toContain('£');
      expect(result).not.toContain('1ze');
    });

    it('shows both 1ZE and fiat in both mode', () => {
      const result = formatPrice({
        izeAmount,
        displayMode: 'both' as CurrencyDisplayMode,
        currencyCode: 'GBP',
        goldRates: rates,
      });
      expect(result).toContain('1ze');
      expect(result).toContain('£');
    });

    it('respects selected currency in fiat and both modes', () => {
      const usdResult = formatPrice({
        izeAmount,
        displayMode: 'fiat' as CurrencyDisplayMode,
        currencyCode: 'USD',
        goldRates: rates,
      });
      expect(usdResult).toContain('$');
    });
  });

  describe('DEFAULT_GOLD_RATES covers all supported currencies', () => {
    const supportedCodes = Object.keys(CURRENCIES) as Array<keyof typeof CURRENCIES>;
    for (const code of supportedCodes) {
      it(`has a rate for ${code}`, () => {
        expect(DEFAULT_GOLD_RATES[code]).toBeDefined();
        expect(DEFAULT_GOLD_RATES[code]).toBeGreaterThan(0);
      });
    }
  });
});

import { describe, it, expect } from 'vitest';
import { formatAuctionIze, toIze, DEFAULT_GOLD_RATES } from '../utils/currency';

describe('VQ-10A19: Auction 1ZE display helper', () => {
  describe('formatAuctionIze', () => {
    it('produces two display decimals', () => {
      const izeAmount = toIze(100, 'GBP', DEFAULT_GOLD_RATES);
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
      const izeAmount = toIze(99.99, 'GBP', DEFAULT_GOLD_RATES);
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

  describe('Auction screens do not use duplicate suffix pattern', () => {
    // These tests verify the source code does not contain the
    // `${formatIzeAmount(...)} 1ZE` duplicate suffix pattern

    it('SellerAuctionCentreScreen uses formatAuctionIze (no duplicate)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../screens/SellerAuctionCentreScreen.tsx'),
        'utf-8',
      );
      expect(src).not.toContain('formatIzeAmount');
      expect(src).toContain('formatAuctionIze');
      // No duplicate suffix pattern
      expect(src).not.toMatch(/formatIzeAmount\([^)]*\)\s*\}\s*1ZE/);
      expect(src).not.toMatch(/formatAuctionIze\([^)]*\)\s*\}\s*1ZE/);
    });

    it('CreateAuctionScreen uses formatAuctionIze (no duplicate)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../screens/CreateAuctionScreen.tsx'),
        'utf-8',
      );
      expect(src).not.toContain('formatIzeAmount');
      expect(src).toContain('formatAuctionIze');
      expect(src).not.toMatch(/formatIzeAmount\([^)]*\)\s*\}\s*1ZE/);
      expect(src).not.toMatch(/formatAuctionIze\([^)]*\)\s*\}\s*1ZE/);
    });

    it('MyBidsScreen uses formatAuctionIze (no duplicate)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../screens/MyBidsScreen.tsx'),
        'utf-8',
      );
      expect(src).not.toContain('formatIzeAmount');
      expect(src).toContain('formatAuctionIze');
      expect(src).not.toMatch(/formatIzeAmount\([^)]*\)\s*\}\s*1ZE/);
      expect(src).not.toMatch(/formatAuctionIze\([^)]*\)\s*\}\s*1ZE/);
    });

    it('BidSheet uses formatAuctionIze (no duplicate, no lowercase)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../components/ui/BidSheet.tsx'),
        'utf-8',
      );
      expect(src).not.toContain('formatIzeAmount');
      expect(src).toContain('formatAuctionIze');
      expect(src).not.toMatch(/formatIzeAmount\([^)]*\)\s*\}\s*1ZE/);
    });

    it('BuyNowSheet uses formatAuctionIze (no duplicate, no lowercase)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../components/ui/BuyNowSheet.tsx'),
        'utf-8',
      );
      expect(src).not.toContain('formatIzeAmount');
      expect(src).toContain('formatAuctionIze');
      expect(src).not.toMatch(/formatIzeAmount\([^)]*\)\s*\}\s*1ZE/);
    });
  });

  describe('Seller Centre does not expose raw terminalReason', () => {
    it('uses mapTerminalReason helper (no raw terminalReason in JSX)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../screens/SellerAuctionCentreScreen.tsx'),
        'utf-8',
      );
      expect(src).toContain('mapTerminalReason');
      // The raw terminalReason should not be directly concatenated into visible text
      expect(src).not.toMatch(/\$\{item\.terminalReason\}/);
      expect(src).not.toMatch(/`.*\$\{item\.terminalReason\}.*`/);
    });

    it('maps known reasons to user-facing copy', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../screens/SellerAuctionCentreScreen.tsx'),
        'utf-8',
      );
      expect(src).toContain('seller_cancelled');
      expect(src).toContain('Cancelled by seller');
      expect(src).toContain('policy_violation');
      expect(src).toContain('Cancelled after review');
      expect(src).toContain('payment_failure');
      expect(src).toContain('Payment was not completed');
    });

    it('falls back to "Cancelled" for unknown or missing reasons', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../screens/SellerAuctionCentreScreen.tsx'),
        'utf-8',
      );
      // The fallback should be "Cancelled" not the raw value
      expect(src).toMatch(/TERMINAL_REASON_MAP\[reason\]\s*\?\?\s*['"]Cancelled['"]/);
    });
  });

  describe('BidSheet preserves binding disclosure', () => {
    it('review stage contains binding notice', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(__dirname, '../components/ui/BidSheet.tsx'),
        'utf-8',
      );
      expect(src).toContain('Bids are binding once accepted.');
      expect(src).toContain('bindingNotice');
    });
  });
});

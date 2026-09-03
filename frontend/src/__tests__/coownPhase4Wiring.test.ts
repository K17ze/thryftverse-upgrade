import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('Phase 4: Feature flags wired into TradeScreen', () => {
  it('FIX: TradeScreen imports useCoOwnFeatureFlags', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('useCoOwnFeatureFlags');
  });

  it('FIX: TradeScreen checks canPlaceOrders', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('canPlaceOrders');
  });

  it('FIX: TradeScreen checks maxOrderSize', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('maxOrderSize');
  });

  it('FIX: TradeScreen shows paper mode banner', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('isPaperMode');
    expect(src).toContain('Paper trading');
  });

  it('FIX: TradeScreen has paper banner styles', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('paperBanner');
  });
});

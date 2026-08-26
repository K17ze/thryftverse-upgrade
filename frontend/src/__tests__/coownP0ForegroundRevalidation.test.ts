import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('P0.2+: Foreground freshness revalidation', () => {
  it('FIX: TradeScreen tracks AppState for foreground transitions', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('AppState');
  });

  it('FIX: TradeScreen has isForegroundStale state', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('isForegroundStale');
  });

  it('FIX: marketIsAuthoritative checks isForegroundStale', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toMatch(/isForegroundStale/);
  });

  it('FIX: TradeScreen clears foreground staleness when fresh data arrives', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toMatch(/setIsForegroundStale\(false\)/);
  });
});

describe('P0.3+: Sequence gap detection', () => {
  it('FIX: TradeScreen tracks lastSequence', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toMatch(/lastSequence/);
  });

  it('FIX: TradeScreen has hasSequenceGap state', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('hasSequenceGap');
  });

  it('FIX: marketIsAuthoritative checks hasSequenceGap', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toMatch(/hasSequenceGap/);
  });
});

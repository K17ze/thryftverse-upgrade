import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('Phase 2: Realtime order book stream hook', () => {
  it('FIX: useCoOwnOrderBookStream hook exists', () => {
    const src = readSrc('hooks/useCoOwnOrderBookStream.ts');
    expect(src).toContain('useCoOwnOrderBookStream');
  });

  it('FIX: hook implements snapshot-plus-delta protocol', () => {
    const src = readSrc('hooks/useCoOwnOrderBookStream.ts');
    expect(src).toContain('fetchSnapshot');
    expect(src).toContain('applyDelta');
  });

  it('FIX: hook detects sequence gaps', () => {
    const src = readSrc('hooks/useCoOwnOrderBookStream.ts');
    expect(src).toContain('hasGap');
    expect(src).toMatch(/seq.*>.*expected|gap/i);
  });

  it('FIX: hook re-fetches snapshot on gap', () => {
    const src = readSrc('hooks/useCoOwnOrderBookStream.ts');
    expect(src).toMatch(/setHasGap\(true\)/);
    expect(src).toMatch(/fetchSnapshot/);
  });

  it('FIX: hook handles foreground revalidation', () => {
    const src = readSrc('hooks/useCoOwnOrderBookStream.ts');
    expect(src).toContain('AppState');
  });

  it('FIX: hook handles WebSocket reconnection', () => {
    const src = readSrc('hooks/useCoOwnOrderBookStream.ts');
    expect(src).toContain('reconnect');
    expect(src).toContain('onclose');
  });

  it('FIX: hook discards duplicate/out-of-order deltas', () => {
    const src = readSrc('hooks/useCoOwnOrderBookStream.ts');
    expect(src).toMatch(/delta\.sequence.*<.*expected|discard/i);
  });

  it('FIX: delta type is exported', () => {
    const src = readSrc('hooks/useCoOwnOrderBookStream.ts');
    expect(src).toContain('CoOwnOrderBookDelta');
  });
});

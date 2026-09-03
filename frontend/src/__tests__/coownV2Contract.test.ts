import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { v2Gbp, v2Minor, assertV2 } from '../services/coownV2Contract';

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

describe('Co-Own v2 contract: type definitions', () => {
  it('FIX: v2 contract file exists', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('contractVersion');
  });

  it('FIX: v2 order book level requires unitPriceGbpStr', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('CoOwnV2OrderBookLevel');
    expect(src).toContain('unitPriceGbpStr');
  });

  it('FIX: v2 preview requires all *Str fields', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('CoOwnV2OrderPreview');
    expect(src).toContain('protectionPriceGbpStr');
    expect(src).toContain('referencePriceGbpStr');
    expect(src).toContain('orderPriceGbpStr');
    expect(src).toContain('avgFillPriceStr');
    expect(src).toContain('worstPriceStr');
    expect(src).toContain('grossNotionalStr');
    expect(src).toContain('feeStr');
    expect(src).toContain('totalStr');
  });

  it('FIX: v2 reservation requires *Str fields', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('CoOwnV2Reservation');
    expect(src).toContain('estimatedTotalGbpStr');
    expect(src).toContain('estimatedFeeGbpStr');
    expect(src).toContain('referencePriceGbpStr');
  });

  it('FIX: v2 order requires *Str fields', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('CoOwnV2Order');
    expect(src).toContain('unitPriceGbpStr');
    expect(src).toContain('feeGbpStr');
    expect(src).toContain('totalGbpStr');
  });

  it('FIX: number fields are marked DEPRECATED', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('DEPRECATED');
  });

  it('FIX: assertV2 helper exists', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('assertV2');
  });

  it('FIX: v2Gbp helper parses decimal strings', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('v2Gbp');
  });

  it('FIX: v2Minor helper returns BigInt', () => {
    const src = readSrc('services/coownV2Contract.ts');
    expect(src).toContain('v2Minor');
    expect(src).toContain('bigint');
  });
});

describe('Co-Own v2 contract: helper correctness', () => {
  it('v2Gbp parses "49.2500" to 49.25', () => {
    expect(v2Gbp('49.2500')).toBe(49.25);
  });

  it('v2Gbp parses "0.0001" to 0.0001', () => {
    expect(v2Gbp('0.0001')).toBeCloseTo(0.0001, 6);
  });

  it('v2Gbp parses "100" to 100', () => {
    expect(v2Gbp('100')).toBe(100);
  });

  it('v2Gbp uses fallback when str is empty', () => {
    expect(v2Gbp('', 42)).toBe(42);
  });

  it('v2Minor returns BigInt', () => {
    expect(typeof v2Minor('49.2500')).toBe('bigint');
    expect(v2Minor('49.2500')).toBe(492500n);
  });

  it('v2Minor handles whole numbers', () => {
    expect(v2Minor('100')).toBe(1000000n);
  });

  it('assertV2 throws on wrong version', () => {
    expect(() => assertV2({ contractVersion: 1 }, 'test')).toThrow();
  });

  it('assertV2 passes on v2', () => {
    expect(() => assertV2({ contractVersion: 2 }, 'test')).not.toThrow();
  });
});

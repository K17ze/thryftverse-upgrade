import { describe, expect, it } from 'vitest';
import { buildDepthRows } from '../utils/orderBookDepth';

describe('order book cumulative depth', () => {
  it('accumulates asks outward from the best ask before reversing their display', () => {
    const asks = [{ price: 10, size: 2 }, { price: 11, size: 5 }, { price: 12, size: 3 }];
    expect(buildDepthRows(asks, true).map(({ level, cumulative }) => [level.price, cumulative]))
      .toEqual([[12, 10], [11, 7], [10, 2]]);
    expect(asks[0].price).toBe(10);
  });

  it('keeps bids best-first and preserves authoritative cumulative totals', () => {
    expect(buildDepthRows([{ price: 9, size: 2, cumulative: 8 }, { price: 8, size: 3, cumulative: 11 }]))
      .toEqual([
        { level: { price: 9, size: 2, cumulative: 8 }, cumulative: 8 },
        { level: { price: 8, size: 3, cumulative: 11 }, cumulative: 11 },
      ]);
    expect(buildDepthRows([])).toEqual([]);
  });
});

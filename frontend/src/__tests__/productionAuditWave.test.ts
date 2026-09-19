import { describe, it, expect, vi } from 'vitest';

import { formatPositionStatus, computePerformers } from '../components/portfolio/portfolioViewModels';
import type { CoOwnPositionVM } from '../services/coOwnPortfolio';
import { queryClient } from '../platform/server/queryClient';
import { clearUserScopedQueryCache } from '../platform/server/clearUserCache';

/**
 * Regression tests for the 2026-09-18 production audit fixes:
 *  - F10: market state derives from the authoritative status field, never
 *    from the viewer's sellable units (availableUnits === 0 ≠ closed).
 *  - F14: the centralized session purge cancels in-flight requests and
 *    clears the whole query cache, not a private-data prefix subset.
 */

function makePosition(overrides: Partial<CoOwnPositionVM>): CoOwnPositionVM {
  return {
    assetId: 'a1',
    listingId: 'l1',
    issuerId: 'i1',
    title: 'Asset',
    imageUrl: null,
    unitsOwned: 10,
    totalUnits: 100,
    ownershipPct: 0.1,
    unitPriceGbp: 5,
    unitPriceStable: 5,
    settlementMode: 'ONEZE',
    currentValueGbp: 50,
    markedValueGbp: 50,
    estimatedSaleProceedsGbp: null,
    saleDepthUnits: 0,
    avgEntryPriceGbp: 5,
    realizedPnlGbp: 0,
    unrealizedPnlGbp: 0,
    availableUnits: 10,
    sellableUnits: 10,
    isOpen: true,
    status: 'open',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('formatPositionStatus (F10)', () => {
  it('keeps an open market open when every owned unit is reserved (availableUnits = 0)', () => {
    const p = makePosition({ isOpen: true, status: 'open', availableUnits: 0, sellableUnits: 0 });
    expect(formatPositionStatus(p)).toBe('open');
  });

  it('reports closed only when the market is actually closed', () => {
    const p = makePosition({ isOpen: false, status: 'closed', availableUnits: 10 });
    expect(formatPositionStatus(p)).toBe('closed');
  });

  it('surfaces paused market state when the VM carries it', () => {
    const p = makePosition({ isOpen: false, status: 'paused' });
    expect(formatPositionStatus(p)).toBe('paused');
  });
});

describe('computePerformers (F09)', () => {
  it('ranks by signed return — a portfolio of all losers still has a best and worst', () => {
    const loser = makePosition({ assetId: 'bad', avgEntryPriceGbp: 10, unrealizedPnlGbp: -20, unitsOwned: 5 });
    const worse = makePosition({ assetId: 'worse', avgEntryPriceGbp: 10, unrealizedPnlGbp: -40, unitsOwned: 5 });
    const { best, worst } = computePerformers([loser, worse]);
    // Best = least negative (-40% vs -80%) — rank is positional; the card
    // must still render direction from the negative sign (verified in the
    // component diff: direction glyph/colour derive from signed pct).
    expect(best?.assetId).toBe('bad');
    expect(worst?.assetId).toBe('worse');
  });

  it('returns nulls when all positions are flat (no fabricated winners)', () => {
    const flat = makePosition({ unrealizedPnlGbp: 0 });
    const { best, worst } = computePerformers([flat]);
    expect(best).toBeNull();
    expect(worst).toBeNull();
  });
});

describe('clearUserScopedQueryCache (F14)', () => {
  it('cancels in-flight requests and clears the entire cache, not a prefix subset', () => {
    const cancel = vi.spyOn(queryClient, 'cancelQueries').mockResolvedValue(undefined as never);
    const clear = vi.spyOn(queryClient, 'clear').mockImplementation(() => {});
    const setData = vi.spyOn(queryClient, 'setQueryData');

    clearUserScopedQueryCache();

    expect(cancel).toHaveBeenCalledWith();
    expect(clear).toHaveBeenCalledTimes(1);
    // The notification badge is reset to a truthful zero, not left stale.
    expect(setData).toHaveBeenCalledWith(['notifications', 'unread-count'], 0);

    cancel.mockRestore();
    clear.mockRestore();
    setData.mockRestore();
  });
});

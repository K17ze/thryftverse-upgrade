import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import type { CoOwnPortfolioResult } from '../services/coOwnPortfolio';

const harness = vi.hoisted(() => ({
  viewer: { id: 'viewer-a' }, fetch: vi.fn(), show: vi.fn(), listings: [],
}));
vi.mock('@react-navigation/native', () => ({ useFocusEffect: (effect: React.EffectCallback) => React.useEffect(effect, [effect]) }));
vi.mock('../store/useStore', () => ({
  useStore: Object.assign((selector: (state: { currentUser: { id: string } }) => unknown) => selector({ currentUser: harness.viewer }), {
    getState: () => ({ currentUser: harness.viewer }),
  }),
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ show: harness.show }) }));
vi.mock('../context/BackendDataContext', () => ({ useBackendData: () => ({ listings: harness.listings }) }));
vi.mock('../services/coOwnPortfolio', () => ({ fetchCoOwnPortfolioPositions: (...args: unknown[]) => harness.fetch(...args) }));
vi.mock('../lib/apiClient', () => ({ parseApiError: () => ({ message: 'Unavailable' }) }));

import { usePortfolioData } from '../hooks/portfolio/usePortfolioData';

it('never carries a previous viewer total into the next account or accepts their late refresh', async () => {
  let current!: ReturnType<typeof usePortfolioData>;
  function Reader() { current = usePortfolioData(); return null; }
  const result = (value: number): CoOwnPortfolioResult => ({
    positions: [], summary: { totalValueGbp: value, totalUnits: 0, totalUnrealizedGbp: 0, totalRealizedGbp: 0, positionCount: 0 },
  });
  let resolveOld!: (result: CoOwnPortfolioResult) => void;
  let resolveNew!: (result: CoOwnPortfolioResult) => void;
  harness.fetch.mockResolvedValueOnce(result(150))
    .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(<Reader />); });
  expect(current.summary.totalValueGbp).toBe(150);
  act(() => { current.handleRefresh(); });
  harness.viewer = { id: 'viewer-b' };
  await act(async () => { tree.update(<Reader />); });
  expect(current.summary.totalValueGbp).toBe(0);
  await act(async () => { resolveOld(result(999)); });
  expect(current.summary.totalValueGbp).toBe(0);
  await act(async () => { resolveNew(result(20)); });
  expect(current.summary.totalValueGbp).toBe(20);
  act(() => tree.unmount());
});

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { AuctionDetailInfoSections } from '../components/auctiondetail/AuctionDetailInfoSections';

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: { textPrimary: '#111111', textSecondary: '#666666', textMuted: '#767676', borderSubtle: '#eeeeee' } }),
}));
vi.mock('../hooks/useHaptic', () => ({ useHaptic: () => ({ light: vi.fn() }) }));
vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({ formatFromFiat: (value: number) => `£${value.toFixed(2)}` }),
}));

describe('auction detail information actions', () => {
  it.each([false, true])('opens bid history once when preview failure is %s', (bidActivityError) => {
    const onViewAllBids = vi.fn();
    const onShowRules = vi.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AuctionDetailInfoSections
        auction={{ id: 'test-auction', description: null, category: null, brand: null, conditionLabel: 'Good', bidCount: 1 }}
        bidActivity={[]}
        bidActivityError={bidActivityError}
        isLive
        serverNow={null}
        onViewAllBids={onViewAllBids}
        onShowRules={onShowRules}
      />);
    });
    const actions = renderer.root.findAll((node) =>
      node.props.accessibilityLabel === 'View all 1 bid' && typeof node.props.onPress === 'function'
    );
    // Select the public component boundary, not its host-renderer wrappers.
    const history = renderer.root.findAllByType(AuctionDetailInfoSections)[0];
    expect(actions.length).toBeGreaterThan(0);
    act(() => actions[0].props.onPress());
    expect(onViewAllBids).toHaveBeenCalledTimes(1);
    const rules = history.findAll((node) => node.props.accessibilityLabel === 'View bidding rules' && typeof node.props.onPress === 'function')[0];
    act(() => rules.props.onPress());
    expect(onShowRules).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer.toJSON()).match(/"Good"/g)).toHaveLength(1);
    act(() => renderer.unmount());
  });
});

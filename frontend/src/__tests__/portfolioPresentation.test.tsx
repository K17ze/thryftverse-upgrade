import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: new Proxy({}, { get: () => '#222222' }) }),
}));
vi.mock('../components/CachedImage', () => ({ CachedImage: () => null }));
vi.mock('../components/ui/CoOwnNumericText', () => ({
  CoOwnNumericText: ({ value }: { value: number }) => React.createElement('Text', null, String(value)),
}));

import { CoOwnPositionCard } from '../components/coown/CoOwnPositionCard';
import { PortfolioSummaryCard } from '../components/portfolio/PortfolioSummaryCard';

function render(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(element); });
  return tree;
}
function content(tree: TestRenderer.ReactTestRenderer) {
  const flatten = (node: TestRenderer.ReactTestInstance | string): string =>
    typeof node === 'string' ? node : node.children.map(flatten).join('');
  return flatten(tree.root);
}
const position = {
  title: 'Leather bag', unitsOwned: 5, totalUnits: 0, ownershipPct: 0,
  currentValueLabel: '50 1ZE', avgEntryLabel: '8 1ZE', status: 'open' as const, sellable: true,
};
const summary = { totalValueGbp: 50, totalUnits: 5, totalUnrealizedGbp: 10, totalRealizedGbp: 0, positionCount: 1 };

describe('portfolio presentation', () => {
  it('omits unknown ownership ratios and keeps the per-unit entry label explicit', () => {
    const tree = render(<CoOwnPositionCard {...position} positionId="asset-a" />);
    expect(content(tree)).toContain('5 units');
    expect(content(tree)).not.toContain('of 0');
    expect(content(tree)).not.toContain('0%');
    const disclosure = tree.root.findAll(node => node.props.accessibilityLabel === 'Show position breakdown for Leather bag')[0];
    act(() => disclosure.props.onPress());
    expect(content(tree)).toContain('Average entry / unit');
    expect(content(tree)).toContain('8 1ZE');
    act(() => tree.unmount());
  });
  it('closes a recycled position disclosure when the asset changes despite identical titles', () => {
    const tree = render(<CoOwnPositionCard {...position} positionId="asset-a" />);
    act(() => tree.root.findAll(node => node.props.accessibilityLabel === 'Show position breakdown for Leather bag')[0].props.onPress());
    act(() => tree.update(<CoOwnPositionCard {...position} positionId="asset-b" />));
    expect(content(tree)).not.toContain('Average entry / unit');
    act(() => tree.unmount());
  });
  it('renders a measured zero daily change without inventing a missing percentage', () => {
    const tree = render(<PortfolioSummaryCard summary={{ ...summary, todayChangeGbp: 0 }} />);
    expect(content(tree)).toContain('Today');
    expect(content(tree)).not.toContain('%');
    act(() => tree.unmount());
  });
  it('omits daily return when unavailable, even if a percentage exists', () => {
    const tree = render(<PortfolioSummaryCard summary={{ ...summary, todayChangePct: 2 }} />);
    expect(content(tree)).not.toContain('Today');
    expect(content(tree)).not.toContain('2.00%');
    act(() => tree.unmount());
  });
});

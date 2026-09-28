import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { SellerAuctionRow } from '../components/auction/SellerAuctionRow';
import { buildAuctionAccessibilityLabel, type AuctionHomeItem } from '../utils/auctionHomeLogic';
import { toIze, formatAuctionIze, DEFAULT_FX_RATES } from '../utils/currency';
import { resolveAuctionTiming } from '../hooks/useServerClock';

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: {
      textPrimary: '#111111',
      textSecondary: '#555555',
      textMuted: '#767676',
      surfaceAlt: '#f2f2f2',
      danger: '#cc2222',
      dangerText: '#b91c1c',
      successText: '#15803d',
      background: '#ffffff',
      border: '#e5e5e5',
    },
  }),
}));

// Stub boundary components — CachedImage pulls expo-image's named exports and
// AnimatedPressable pulls the haptics/motion stack; the setup mocks only cover
// the primitives underneath them.
vi.mock('../components/CachedImage', () => {
  const React = require('react');
  return {
    CachedImage: React.forwardRef((props: any, ref: any) =>
      React.createElement('CachedImage', { ref, ...props })),
  };
});
vi.mock('../components/AnimatedPressable', () => {
  const React = require('react');
  return {
    AnimatedPressable: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('Pressable', { ref, ...props })),
  };
});

const NOW = Date.parse('2026-09-28T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

function makeItem(overrides: Partial<AuctionHomeItem> = {}): AuctionHomeItem {
  return {
    id: 'a1',
    listingId: 'l1',
    sellerId: 's1',
    sellerUsername: 'seller1',
    sellerDisplayName: 'Seller One',
    sellerAvatarUrl: null,
    title: 'Vintage denim jacket',
    imageUrl: 'https://example.com/jacket.jpg',
    brand: 'Nike',
    startsAt: iso(NOW - 60 * 60 * 1000),
    endsAt: iso(NOW + 2 * 60 * 60 * 1000 + 14 * 60 * 1000),
    startingBidGbp: 40,
    currentBidGbp: 57,
    minimumNextBidGbp: 60,
    bidCount: 12,
    buyNowPriceGbp: null,
    reservePriceGbp: null,
    viewerState: 'seller',
    isWatched: false,
    winnerBidderId: null,
    cancelledAt: null,
    settledAt: null,
    lifecycle: 'live',
    terminalReason: null,
    ...overrides,
  };
}

function renderRow(item: AuctionHomeItem, clockMs = NOW) {
  const onPress = vi.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <SellerAuctionRow
        item={item}
        clockMs={clockMs}
        onPress={onPress}
        formatFromFiat={(v: number) => `£${v.toFixed(2)}`}
        fxRates={DEFAULT_FX_RATES}
        currencyCode="GBP"
      />,
    );
  });
  return { renderer, onPress };
}

/** Recursively collects every string child under a test-instance node. */
function textOf(node: TestRenderer.ReactTestInstance): string {
  const children = node.children ?? [];
  return children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');
}

function allTextNodes(renderer: TestRenderer.ReactTestRenderer) {
  // The RN mock renders host elements, whose `type` is the tag string.
  return renderer.root.findAll((node) => String(node.type) === 'Text');
}

function nodeText(renderer: TestRenderer.ReactTestRenderer): string {
  return allTextNodes(renderer).map(textOf).join('|');
}

describe('SellerAuctionRow density (audit finding 09)', () => {
  it('renders identity, one commercial value and one action on a live row', () => {
    const item = makeItem();
    const { renderer, onPress } = renderRow(item);
    const text = nodeText(renderer);
    const timing = resolveAuctionTiming(item, NOW);

    // Identity: title + state label.
    expect(text).toContain('Vintage denim jacket');
    expect(text).toContain('Live');

    // Exactly one commercial value — the exact 1ZE amount, never clamped.
    const valueNodes = allTextNodes(renderer).filter((n) => textOf(n).includes('1ZE'));
    expect(valueNodes).toHaveLength(1);
    expect(textOf(valueNodes[0])).toBe(`Current ${formatAuctionIze(toIze(57, 'GBP'))}`);

    // One next task.
    expect(text).toContain('View bids');

    // Supporting facts fold into the quiet metadata line.
    expect(text).toContain('2h 14m left · £57.00 · Nike · 12 bids');

    // Accessibility contract is unchanged.
    const pressable = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    )[0];
    expect(pressable.props.accessibilityLabel).toBe(
      buildAuctionAccessibilityLabel(item, timing, 'Current bid', '£57.00'),
    );
    act(() => pressable.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it('keeps a long title and long price exact — value wraps instead of truncating', () => {
    const item = makeItem({
      title:
        'Extremely long archival designer listing title that runs well past two rendered lines of text',
      currentBidGbp: 1234567.89,
      bidCount: 234,
    });
    const { renderer } = renderRow(item);
    const expectedValue = `Current ${formatAuctionIze(toIze(1234567.89, 'GBP'))}`;

    const valueNodes = allTextNodes(renderer).filter((n) => textOf(n).includes('1ZE'));
    expect(valueNodes).toHaveLength(1);
    // Full exact value is emitted and no line clamp can hide digits.
    expect(textOf(valueNodes[0])).toBe(expectedValue);
    expect(valueNodes[0].props.numberOfLines).toBeUndefined();

    // The local-currency conversion also lives in an unclamped wrapping line.
    const metaNodes = allTextNodes(renderer).filter((n) => textOf(n).includes('£1234567.89'));
    expect(metaNodes.length).toBeGreaterThan(0);
    expect(metaNodes[0].props.numberOfLines).toBeUndefined();

    // The title stays the only clamped element, capped at two lines.
    const titleNode = allTextNodes(renderer).find((n) => textOf(n).startsWith('Extremely long'));
    expect(titleNode?.props.numberOfLines).toBe(2);
    act(() => renderer.unmount());
  });

  it('renders the sold state with final bid value and sale action', () => {
    const item = makeItem({
      settledAt: iso(NOW - 60 * 60 * 1000),
      winnerBidderId: 'bidder-9',
      bidCount: 7,
      currentBidGbp: 88,
      lifecycle: 'settled',
    });
    const { renderer } = renderRow(item);
    const text = nodeText(renderer);

    expect(text).toContain('Sold');
    expect(text).toContain('View sale');
    // Bid count survives folded into the metadata line ("Sold · 7 bids").
    expect(text).toContain('Sold · 7 bids');
    // Exact final value with the correct state prefix.
    expect(text).toContain(`Final ${formatAuctionIze(toIze(88, 'GBP'))}`);
    act(() => renderer.unmount());
  });

  it('exposes the bid count on a live row', () => {
    const { renderer } = renderRow(makeItem({ bidCount: 1 }));
    const text = nodeText(renderer);
    expect(text).toContain('1 bid');
    act(() => renderer.unmount());
  });

  it('renders a scheduled row with the start countdown and schedule action', () => {
    const item = makeItem({
      startsAt: iso(NOW + 26 * 60 * 60 * 1000),
      endsAt: iso(NOW + 30 * 60 * 60 * 1000),
      bidCount: 0,
      currentBidGbp: 0,
      lifecycle: 'upcoming',
    });
    const { renderer } = renderRow(item);
    const text = nodeText(renderer);

    expect(text).toContain('Scheduled');
    expect(text).toContain('View schedule');
    expect(text).toContain(`Starts ${formatAuctionIze(toIze(40, 'GBP'))}`);
    expect(text).toContain('Starts in 1d 2h');
    // Zero-bid inventory shows no bid-count fragment.
    expect(text).not.toContain('bids');
    act(() => renderer.unmount());
  });

  // Amount selection is single-sourced through resolvePriceAmount — the
  // headline, the fiat metadata and the screen-reader label must agree even
  // when bidCount and currentBidGbp disagree (retracted bids, stale data).
  it('keeps headline, metadata and a11y in agreement when bids exist but the bid is zero', () => {
    const item = makeItem({ bidCount: 3, currentBidGbp: 0 });
    const { renderer } = renderRow(item);
    const text = nodeText(renderer);

    // "Current bid" is what the resolvers resolve — the headline prints the
    // same zeroed amount rather than silently falling back to the ask.
    expect(text).toContain(`Current ${formatAuctionIze(toIze(0, 'GBP'))}`);
    const pressable = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    )[0];
    expect(pressable.props.accessibilityLabel).toContain('Current bid £0.00');
    act(() => renderer.unmount());
  });

  it('labels a stray currentBid without bids as the starting ask, matching the resolvers', () => {
    const item = makeItem({ bidCount: 0, currentBidGbp: 250, startingBidGbp: 40 });
    const { renderer } = renderRow(item);
    const text = nodeText(renderer);

    // resolvePriceAmount picks the starting ask when no bids exist, so the
    // headline is "Starts …" — not the orphan currentBid figure.
    expect(text).toContain(`Starts ${formatAuctionIze(toIze(40, 'GBP'))}`);
    expect(text).not.toContain(formatAuctionIze(toIze(250, 'GBP')));
    const pressable = renderer.root.findAll(
      (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
    )[0];
    expect(pressable.props.accessibilityLabel).toContain('Starting bid £40.00');
    act(() => renderer.unmount());
  });

  it('shrinks the media slot into the 72–80pt inventory band and keeps the live dot', () => {
    const { renderer } = renderRow(makeItem());
    const image = renderer.root.findAll((node) => String(node.type) === 'CachedImage')[0];
    expect(image.props.style.width).toBeGreaterThanOrEqual(72);
    expect(image.props.style.width).toBeLessThanOrEqual(80);
    expect(image.props.style.height).toBe(image.props.style.width);
    act(() => renderer.unmount());
  });
});

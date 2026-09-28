/**
 * Regression tests for audit-2026-09-28 findings 18, 19 and 20 —
 * discovery media integrity in PinterestMasonryGrid.
 *
 *   18 (P1): non-listing media units (look / poster / moodboard covers)
 *     rendered through bare ExpoImage with no onError or placeholder, so a
 *     failed decode left the parent's neutral fill carrying the whole tile.
 *     DiscoveryMediaImage now gives every unit type the same contract a
 *     listing tile gets from CachedImage: a missing or failed source keeps
 *     the authored frame and shows a quiet media-unavailable glyph — never
 *     a blank rect, never unrelated stock imagery.
 *   19 (P2): creator verification glyphs used `colors.brand` (near-black in
 *     the light theme) over a dark scrim — unreadable over imagery. They now
 *     use the media-overlay foreground role (colors.mediaOverlayText).
 *   20 (P2): the reduced-motion preference was read and discarded; media
 *     transitions were fixed at 160ms. Under reduced motion the swap is
 *     instant (transition 0).
 *
 * The grid renders through the real PinterestMasonryGrid component tree with
 * FlashList / expo-image / theme mocked at the module boundary, so the
 * assertions exercise real renderUnit + tile logic (same convention as
 * discoveryFailureAttribution.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { DiscoveryFeedUnit } from '../contracts/discoveryFeedUnit';
import { LIGHT_COLORS } from '../constants/colors';

// ── Shared mutable harness ──
const h = vi.hoisted(() => ({
  reducedMotion: false,
}));

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => h.reducedMotion,
}));

vi.mock('../theme/ThemeContext', () => ({
  // The real light palette: brand is near-black (#111111) while
  // mediaOverlayText is always light — the contrast finding 19 depends on.
  useAppTheme: () => ({ colors: LIGHT_COLORS, isDark: false }),
}));

// The global setup mock only provides `default`; the grid uses the named
// `Image` export. Rendered as a host 'ExpoImage' node so tests can read
// props and fire onError/onLoad.
vi.mock('expo-image', () => {
  const React = require('react');
  return {
    Image: React.forwardRef((props: any, ref: any) =>
      React.createElement('ExpoImage', { ref, ...props })),
  };
});

vi.mock('expo-linear-gradient', () => {
  const React = require('react');
  return { LinearGradient: (props: any) => React.createElement('LinearGradient', props) };
});

// FlashList renders every item through the real renderItem so the unit
// tiles mount in the test tree.
vi.mock('@shopify/flash-list', () => {
  const React = require('react');
  return {
    FlashList: (props: any) =>
      React.createElement(
        'FlashList',
        props,
        (props.data ?? []).map((item: any, index: number) =>
          React.createElement(
            React.Fragment,
            { key: item.id ?? index },
            props.renderItem?.({ item, index }))),
      ),
  };
});

// Listing tiles are out of scope for these findings — stub the tile so the
// heavy ProductCard import chain (CachedImage, price/haptic hooks) never
// loads.
vi.mock('../components/ProductCard', () => {
  const React = require('react');
  return {
    ProductDiscoveryTile: (props: any) => React.createElement('ProductDiscoveryTile', props),
  };
});

// Only the URI resolver is imported by the grid; CachedImage's own failure
// contract is the reference behavior, not the unit under test.
vi.mock('../components/CachedImage', () => ({
  resolveCachedImageSourceUri: (uri: string) => uri,
}));

vi.mock('../components/skeletons/MasonrySkeleton', () => ({
  MasonrySkeleton: () => null,
}));
vi.mock('../components/discover/PremiumSkeletonTile', () => ({
  PremiumSkeletonTile: () => null,
}));
vi.mock('../components/EmptyState', () => ({
  EmptyState: () => null,
}));
vi.mock('../utils/imagePreloader', () => ({
  preloadCriticalImages: vi.fn(),
}));

import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';

// ── Fixtures ──
const lookUnit = (over: Record<string, unknown> = {}): DiscoveryFeedUnit =>
  ({
    id: 'look:1',
    type: 'look',
    look: {
      id: 'look-1',
      creator: { username: 'ana', verified: true },
    },
    title: 'Summer fit',
    coverImageUri: 'https://img.test/look-1.jpg',
    aspectRatio: 0.8,
    itemIds: ['l1'],
    ...over,
  }) as unknown as DiscoveryFeedUnit;

const posterUnit = (over: Record<string, unknown> = {}): DiscoveryFeedUnit =>
  ({
    id: 'poster:1',
    type: 'poster',
    story: {
      id: 'story-1',
      creator: { username: 'bob', isVerified: true },
    },
    coverUri: 'https://img.test/poster-1.jpg',
    aspectRatio: 0.5625,
    ...over,
  }) as unknown as DiscoveryFeedUnit;

const moodboardUnit = (over: Record<string, unknown> = {}): DiscoveryFeedUnit =>
  ({
    id: 'moodboard:1',
    type: 'moodboard',
    moodboard: {
      id: 'mb-1',
      title: 'Autumn tones',
      curator: 'Studio K',
      items: [
        { imageUri: 'https://img.test/mb-a.jpg' },
        { imageUri: 'https://img.test/mb-b.jpg' },
      ],
    },
    coverUri: 'https://img.test/mb-cover.jpg',
    aspectRatio: 1.6,
    ...over,
  }) as unknown as DiscoveryFeedUnit;

const renderGrid = async (items: DiscoveryFeedUnit[], props: Record<string, unknown> = {}) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<PinterestMasonryGrid items={items} {...props} />);
  });
  return renderer;
};

const findImages = (root: TestRenderer.ReactTestInstance) =>
  root.findAll((n) => n.type === ('ExpoImage' as unknown));

// Host nodes only: the string-component mocks mean findAll matches both the
// composite and its rendered host element for the same props (same
// convention as discoveryFailureAttribution.test.tsx).
const findFallbacks = (root: TestRenderer.ReactTestInstance) =>
  root.findAll((n) => typeof n.type === 'string' && n.props?.testID === 'discovery-media-fallback');

const findIcon = (root: TestRenderer.ReactTestInstance, name: string) =>
  root.findAll((n) => n.type === ('Ionicons' as unknown) && n.props?.name === name);

beforeEach(() => {
  h.reducedMotion = false;
});

// ============================================================================
// Finding 18 — loading/error contract across every non-listing media type
// ============================================================================
describe('PinterestMasonryGrid — media failure keeps a coherent tile (finding 18)', () => {
  it('look cover failure renders a quiet media-unavailable fallback, keeping title context', async () => {
    const renderer = await renderGrid([lookUnit()]);

    const image = findImages(renderer.root)[0];
    expect(image.props.source.uri).toBe('https://img.test/look-1.jpg');
    expect(findFallbacks(renderer.root)).toHaveLength(0);

    await act(async () => {
      image.props.onError({ error: 'decode failed' });
    });

    // The image is replaced by the muted fallback; the tile's textual
    // identity (title + creator) still renders over the scrim.
    expect(findImages(renderer.root)).toHaveLength(0);
    expect(findFallbacks(renderer.root)).toHaveLength(1);
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Summer fit');
    expect(json).toContain('look by ana');

    await act(async () => renderer.unmount());
  });

  it('poster cover failure renders the same fallback contract', async () => {
    const renderer = await renderGrid([posterUnit()]);

    const image = findImages(renderer.root)[0];
    await act(async () => {
      image.props.onError({ error: 'network' });
    });

    expect(findFallbacks(renderer.root)).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).toContain('Poster by bob');

    await act(async () => renderer.unmount());
  });

  it('moodboard collage applies the contract per cell — a failed cell falls back without losing the rest', async () => {
    const renderer = await renderGrid([moodboardUnit()]);

    // Cover + 2 item cells = 3 media sources.
    const images = findImages(renderer.root);
    expect(images).toHaveLength(3);

    await act(async () => {
      images[1].props.onError({ error: '404' });
    });

    expect(findImages(renderer.root)).toHaveLength(2);
    expect(findFallbacks(renderer.root)).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).toContain('Autumn tones');

    await act(async () => renderer.unmount());
  });

  it('an empty cover source renders the fallback instead of a blank image', async () => {
    const renderer = await renderGrid([lookUnit({ coverImageUri: '  ' })]);

    expect(findImages(renderer.root)).toHaveLength(0);
    expect(findFallbacks(renderer.root)).toHaveLength(1);

    await act(async () => renderer.unmount());
  });

  it('a recycled cell carrying a new source recovers — failure is keyed to the failed URI', async () => {
    const renderer = await renderGrid([lookUnit()]);

    const image = findImages(renderer.root)[0];
    await act(async () => {
      image.props.onError({ error: 'decode failed' });
    });
    expect(findFallbacks(renderer.root)).toHaveLength(1);

    // FlashList recycles: the same tile slot receives a different unit.
    await act(async () => {
      renderer.update(
        <PinterestMasonryGrid
          items={[lookUnit({ id: 'look:1', coverImageUri: 'https://img.test/look-2.jpg' })]}
        />,
      );
    });

    expect(findFallbacks(renderer.root)).toHaveLength(0);
    expect(findImages(renderer.root)[0].props.source.uri).toBe('https://img.test/look-2.jpg');

    await act(async () => renderer.unmount());
  });
});

// ============================================================================
// Finding 19 — verification glyphs use the media-overlay foreground role
// ============================================================================
describe('PinterestMasonryGrid — verification glyph contrast (finding 19)', () => {
  it('look creator check uses mediaOverlayText, not the near-black light-theme brand', async () => {
    const renderer = await renderGrid([lookUnit()]);

    const checks = findIcon(renderer.root, 'checkmark-circle');
    expect(checks).toHaveLength(1);
    expect(checks[0].props.color).toBe(LIGHT_COLORS.mediaOverlayText);
    expect(checks[0].props.color).not.toBe(LIGHT_COLORS.brand);
    // Controlled backing: the scrim shadow keeps the glyph legible over
    // arbitrary photography in both themes.
    expect(checks[0].props.style?.textShadowColor).toBe(LIGHT_COLORS.mediaOverlayScrim);

    await act(async () => renderer.unmount());
  });

  it('poster creator check uses the same overlay role', async () => {
    const renderer = await renderGrid([posterUnit()]);

    const checks = findIcon(renderer.root, 'checkmark-circle');
    expect(checks).toHaveLength(1);
    expect(checks[0].props.color).toBe(LIGHT_COLORS.mediaOverlayText);
    expect(checks[0].props.color).not.toBe(LIGHT_COLORS.brand);

    await act(async () => renderer.unmount());
  });
});

// ============================================================================
// Finding 20 — reduced motion disables media transitions
// ============================================================================
describe('PinterestMasonryGrid — reduced motion (finding 20)', () => {
  it('renders media swaps instantly when reduced motion is enabled', async () => {
    h.reducedMotion = true;
    const renderer = await renderGrid([lookUnit(), posterUnit(), moodboardUnit()]);

    const images = findImages(renderer.root);
    // look (1) + poster (1) + moodboard (3 cells) — every media node honors it.
    expect(images).toHaveLength(5);
    for (const image of images) {
      expect(image.props.transition).toBe(0);
    }

    await act(async () => renderer.unmount());
  });

  it('keeps the authored 160ms transition under normal motion', async () => {
    const renderer = await renderGrid([lookUnit(), posterUnit()]);

    const images = findImages(renderer.root);
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image.props.transition).toBe(160);
    }

    await act(async () => renderer.unmount());
  });
});

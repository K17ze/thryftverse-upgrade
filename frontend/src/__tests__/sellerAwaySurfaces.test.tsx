import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// Mock ThemeContext before importing components — same pattern as
// commerceDetailRuntime.test.tsx.
vi.mock('../theme/ThemeContext', () => {
  const React = require('react');
  const mockColors = {
    background: '#ffffff',
    surface: '#f5f5f5',
    surfaceElevated: '#ffffff',
    surfaceAlt: '#f0f0f0',
    textPrimary: '#000000',
    textSecondary: '#666666',
    textMuted: '#999999',
    textInverse: '#ffffff',
    border: '#e0e0e0',
    borderSubtle: '#f0f0f0',
    brand: '#0066cc',
    success: '#00aa44',
    warning: '#ff9900',
    danger: '#cc0000',
    input: '#f5f5f5',
    overlay: 'rgba(0,0,0,0.4)',
  };
  const ctx = {
    themePreference: 'light' as const,
    resolvedTheme: 'light' as const,
    colors: mockColors,
    isDark: false,
    setThemePreference: () => {},
  };
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement('ThemeProvider', null, children),
    useAppTheme: () => ctx,
  };
});

vi.mock('../components/CachedImage', () => {
  const React = require('react');
  return {
    CachedImage: React.forwardRef((props: any, ref: any) =>
      React.createElement('CachedImage', { ref, ...props })
    ),
  };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  Feather: () => null,
}));

vi.mock('../components/common/AppIcon', () => ({
  AppIcon: () => null,
}));

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({ light: () => {}, medium: () => {}, heavy: () => {}, patterns: { save: () => {} }, selection: () => {} }),
}));

import { CommerceActionDock } from '../components/commerce/detail/CommerceActionDock';
import { CommerceTrustDossier } from '../components/commerce/detail/CommerceTrustDossier';
import type { Listing } from '../services/listingsApi';
import type {
  ListingCapabilities,
  ListingCommerceContext,
  SellerTrustSummary,
} from '../platform/product/listingDetailContract';

function renderTree(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer!;
}

function findTextInstances(node: TestRenderer.ReactTestInstance | string | null): string[] {
  if (typeof node === 'string') return [node];
  if (!node) return [];
  const instances: string[] = [];
  const children = (node as TestRenderer.ReactTestInstance).children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child === 'string') {
        instances.push(child);
      } else if (child && typeof child === 'object') {
        instances.push(...findTextInstances(child as TestRenderer.ReactTestInstance));
      }
    }
  }
  return instances;
}

function getAllText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return findTextInstances(renderer.root);
}

function hasText(renderer: TestRenderer.ReactTestRenderer, text: string): boolean {
  return getAllText(renderer).some((t) => t.includes(text));
}

const item = {
  id: 'listing_1',
  title: 'Vintage jacket',
  price: 120,
  images: [],
} as unknown as Listing;

const buyerCapabilities: ListingCapabilities = {
  canBuy: true,
  canOffer: true,
  canEdit: false,
  canManage: false,
  canMessage: true,
  isOwner: false,
  isSold: false,
  isAvailable: true,
  unavailableReason: null,
  commerceTier: 'standard',
};

const commerce: ListingCommerceContext = {
  itemPrice: 120,
  currency: 'GBP',
};

const dockProps = {
  item,
  capabilities: buyerCapabilities,
  commerce,
  formattedPrice: '£120',
  formattedOriginal: null,
  hasDiscount: false,
  onManageListing: () => {},
  onBrowseSimilar: () => {},
  onBuyNow: () => {},
  onMakeOffer: () => {},
  onEnquire: () => {},
  onRequestViewing: () => {},
};

const awaySeller: SellerTrustSummary = {
  id: 'seller_1',
  username: 'away_seller',
  holidayMode: true,
  holidayModeUntil: '2026-03-10T00:00:00.000Z',
  awayMessage: null,
};

describe('seller-away surfaces (react-test-renderer)', () => {
  // ── CommerceActionDock — the purchase dock is the honest mirror of the
  //    backend hard block: away sellers show a paused state, not CTAs that
  //    can only 409. ──

  it('replaces buy/offer affordances with a paused state while the seller is away', () => {
    const renderer = renderTree(
      <CommerceActionDock {...dockProps} seller={awaySeller} />
    );
    expect(hasText(renderer, 'Seller away')).toBe(true);
    // The real return date is rendered — never fabricated.
    expect(getAllText(renderer).some((t) => t.includes('paused'))).toBe(true);
    // No dead-end CTAs: Buy now / Make offer would only hit SELLER_AWAY.
    expect(hasText(renderer, 'Make offer')).toBe(false);
  });

  it('renders no return-date copy when the seller never published one', () => {
    const openEnded: SellerTrustSummary = {
      id: 'seller_1',
      username: 'away_seller',
      holidayMode: true,
      holidayModeUntil: null,
      awayMessage: 'Gone fishing',
    };
    const renderer = renderTree(
      <CommerceActionDock {...dockProps} seller={openEnded} />
    );
    expect(hasText(renderer, 'Seller away')).toBe(true);
    expect(hasText(renderer, 'Gone fishing')).toBe(true);
    // Nothing claims a date the seller never set.
    expect(getAllText(renderer).some((t) => /back \w+ \d/i.test(t))).toBe(false);
  });

  it('renders normal purchase affordances when the seller is not away', () => {
    const activeSeller: SellerTrustSummary = {
      id: 'seller_1',
      username: 'active_seller',
      holidayMode: false,
      holidayModeUntil: null,
    };
    const renderer = renderTree(
      <CommerceActionDock {...dockProps} seller={activeSeller} />
    );
    expect(hasText(renderer, 'Seller away')).toBe(false);
  });

  // ── CommerceTrustDossier — the first-viewport trust facts carry the away
  //    signal and suppress dispatch claims that would be untruthful. ──

  it('shows the away row and suppresses dispatch promises while the seller is away', () => {
    const seller: SellerTrustSummary = {
      ...awaySeller,
      dispatchTimeLabel: 'Ships in 2 days',
      // The label only renders alongside real measured hours — the backend
      // infers it from response-rate bands when avgResponseHours is null.
      responseTimeLabel: 'Usually responds in 2h',
      avgResponseHours: 2,
    };
    const renderer = renderTree(
      <CommerceTrustDossier
        seller={seller}
        commerce={commerce}
      />
    );
    expect(hasText(renderer, 'Seller away')).toBe(true);
    // Quoting a dispatch cadence while the shop is paused is untruthful —
    // the row is suppressed, not merely caveated.
    expect(hasText(renderer, 'Ships in 2 days')).toBe(false);
    expect(hasText(renderer, 'Usually responds in 2h')).toBe(true);
  });

  it('shows the dispatch promise again once the seller is back', () => {
    const seller: SellerTrustSummary = {
      id: 'seller_1',
      username: 'active_seller',
      holidayMode: false,
      dispatchTimeLabel: 'Ships in 2 days',
    };
    const renderer = renderTree(
      <CommerceTrustDossier
        seller={seller}
        commerce={commerce}
      />
    );
    expect(hasText(renderer, 'Ships in 2 days')).toBe(true);
    expect(hasText(renderer, 'Seller away')).toBe(false);
  });
});

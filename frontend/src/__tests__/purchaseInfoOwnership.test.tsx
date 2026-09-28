import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';

// Mock ThemeContext before importing components
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
    successSubtle: '#e6f4ea',
    successText: '#0a7a33',
    warning: '#ff9900',
    danger: '#cc0000',
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

// Mock CachedImage to avoid expo-image transitive import issues
vi.mock('../components/CachedImage', () => {
  const React = require('react');
  return {
    CachedImage: React.forwardRef((props: any, ref: any) =>
      React.createElement('CachedImage', { ref, ...props })
    ),
  };
});

// Mock useReducedMotion — skip Reanimated animations
vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

// Mock useHaptic
vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({ light: () => {}, medium: () => {}, heavy: () => {} }),
}));

// Mock useFormattedPrice — deterministic fiat strings
vi.mock('../hooks/useFormattedPrice', () => ({
  useFormattedPrice: () => ({
    currencyCode: 'GBP',
    formatFromFiat: (value: number) => `£${value.toFixed(2)}`,
  }),
}));

// The commerce/detail barrel transitively loads heavier modules
// (media rails, offer sheets) that are not exercisable in the node test
// environment. Stub the barrel at its module boundary and re-export the
// real leaf components the section consumes — the components under test
// stay real; SustainabilityImpact is unrelated to the purchase-info
// ownership contract, so it renders null and its copy can never pollute
// the duplication assertions.
vi.mock('../components/commerce/detail', async () => {
  const section = await vi.importActual<typeof import('../components/commerce/detail/CommerceDetailSection')>(
    '../components/commerce/detail/CommerceDetailSection',
  );
  const row = await vi.importActual<typeof import('../components/commerce/detail/CommerceDetailDisclosureRow')>(
    '../components/commerce/detail/CommerceDetailDisclosureRow',
  );
  const shipping = await vi.importActual<typeof import('../components/commerce/detail/ShippingReturnsInfo')>(
    '../components/commerce/detail/ShippingReturnsInfo',
  );
  return {
    CommerceDetailSection: section.CommerceDetailSection,
    CommerceDetailDisclosureRow: row.CommerceDetailDisclosureRow,
    ShippingReturnsInfo: shipping.ShippingReturnsInfo,
    SustainabilityImpact: () => null,
  };
});

import { ItemDetailBuyingSection } from '../components/itemdetail/ItemDetailBuyingSection';
import type { ListingCommerceContext } from '../platform/product/listingDetailContract';

function renderSection(
  commerce: ListingCommerceContext,
  options: { purchaseSummary?: string; onShowPurchaseDetails?: () => void } = {},
) {
  const onShowPurchaseDetails = options.onShowPurchaseDetails ?? vi.fn();
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(
      <ItemDetailBuyingSection
        purchaseSummary={options.purchaseSummary ?? 'terms present'}
        commerce={commerce}
        listingId="l1"
        onShowPurchaseDetails={onShowPurchaseDetails}
      />,
    );
  });
  return { renderer: renderer!, onShowPurchaseDetails };
}

function buttons(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function',
  );
}

function costsRow(renderer: TestRenderer.ReactTestRenderer) {
  return buttons(renderer).find((node) =>
    typeof node.props.accessibilityLabel === 'string'
    && node.props.accessibilityLabel.startsWith('Costs & buyer protection'),
  );
}

function shippingRow(renderer: TestRenderer.ReactTestRenderer) {
  return buttons(renderer).find((node) =>
    typeof node.props.accessibilityLabel === 'string'
    && node.props.accessibilityLabel.startsWith('Shipping and returns.'),
  );
}

function findTextInstances(node: TestRenderer.ReactTestInstance | string | null): string[] {
  if (typeof node === 'string') return [node];
  if (!node) return [];
  const instances: string[] = [];
  const children = node.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (typeof child === 'string') instances.push(child);
      else instances.push(...findTextInstances(child as TestRenderer.ReactTestInstance));
    }
  }
  return instances;
}

function getAllText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return findTextInstances(renderer.root);
}

function countOccurrences(renderer: TestRenderer.ReactTestRenderer, needle: string): number {
  return getAllText(renderer).filter((t) => t.includes(needle)).length;
}

const baseCommerce: ListingCommerceContext = {
  itemPrice: 45,
  currency: 'GBP',
};

describe('purchase-information ownership (audit finding 04)', () => {
  describe('collapsed shipping disclosure — the at-a-glance truth', () => {
    it('states free shipping and no returns before expansion', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        shippingPayer: 'seller',
        returnPolicy: { accepted: false },
      });
      const shipping = shippingRow(renderer)!;
      expect(shipping.props.accessibilityLabel).toBe('Shipping and returns. Free shipping · No returns');
      expect(shipping.props.accessibilityState.expanded).toBe(false);
      act(() => renderer.unmount());
    });

    it('states the paid shipping amount and the return window before expansion', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        shippingPayer: 'buyer',
        shippingPrice: 3.49,
        returnPolicy: { accepted: true, windowDays: 14 },
      });
      const shipping = shippingRow(renderer)!;
      expect(shipping.props.accessibilityLabel).toBe('Shipping and returns. Shipping: £3.49 · 14-day returns');
      act(() => renderer.unmount());
    });

    it('keeps unknown policy explicitly unknown rather than fabricating a fact', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        shippingPayer: null,
        returnPolicy: null,
      });
      const shipping = shippingRow(renderer)!;
      expect(shipping.props.accessibilityLabel).toBe(
        'Shipping and returns. Shipping calculated at checkout · Return policy confirmed at checkout',
      );
      act(() => renderer.unmount());
    });

    it('keeps the full policy detail reachable behind expansion', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        shippingPayer: 'buyer',
        shippingPrice: 3.49,
        returnPolicy: { accepted: true, windowDays: 14, conditions: 'Items must be unworn.' },
      });
      const shipping = shippingRow(renderer)!;
      act(() => shipping.props.onPress());
      expect(shippingRow(renderer)!.props.accessibilityState.expanded).toBe(true);
      expect(countOccurrences(renderer, 'Shipping cost')).toBeGreaterThan(0);
      expect(countOccurrences(renderer, 'Return window')).toBeGreaterThan(0);
      expect(countOccurrences(renderer, 'Items must be unworn.')).toBeGreaterThan(0);
      act(() => renderer.unmount());
    });
  });

  describe('costs & buyer protection row — the path to complete terms', () => {
    it('still opens the purchase-terms destination once', () => {
      const onShowPurchaseDetails = vi.fn();
      const { renderer } = renderSection(
        { ...baseCommerce, shippingPayer: 'seller', returnPolicy: { accepted: false } },
        { onShowPurchaseDetails },
      );
      const row = costsRow(renderer)!;
      expect(row).toBeTruthy();
      act(() => row.props.onPress());
      expect(onShowPurchaseDetails).toHaveBeenCalledTimes(1);
      act(() => renderer.unmount());
    });

    it('previews sheet-owned facts — total, protection, authenticity — and no others', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        estimatedTotal: 48.5,
        buyerProtectionFee: 3.5,
        shippingPayer: 'buyer',
        shippingPrice: 3.49,
        shippingMethod: 'Royal Mail',
        protectionPolicy: {
          available: true,
          label: 'Buyer Protection',
          summary: 'Covered by Thryftverse Buyer Protection.',
        },
        authenticity: { status: 'verified' },
        returnPolicy: { accepted: true, windowDays: 14 },
      });
      const row = costsRow(renderer)!;
      // Owned facts are announced with the destination.
      expect(row.props.accessibilityLabel).toBe(
        'Costs & buyer protection, Est. total £48.50 (excl. shipping) · Buyer Protection · Authenticity verified',
      );
      // The row must not restate what the shipping disclosure owns.
      expect(row.props.accessibilityLabel).not.toContain('£3.49');
      expect(row.props.accessibilityLabel).not.toContain('Royal Mail');
      expect(row.props.accessibilityLabel.toLowerCase()).not.toContain('return');
      // The shipping disclosure remains the owner of delivery/returns facts.
      expect(shippingRow(renderer)!.props.accessibilityLabel).toBe(
        'Shipping and returns. Shipping: £3.49 · 14-day returns',
      );
      act(() => renderer.unmount());
    });

    it('drops the shipping qualifier from the estimated total when shipping is free', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        estimatedTotal: 48.5,
        shippingPayer: 'seller',
        returnPolicy: { accepted: false },
      });
      const row = costsRow(renderer)!;
      expect(row.props.accessibilityLabel).toBe('Costs & buyer protection, Est. total £48.50');
      expect(row.props.accessibilityLabel).not.toContain('excl. shipping');
      act(() => renderer.unmount());
    });

    it('lets the label carry the row alone when the sheet owns no previewable facts', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        shippingPayer: 'seller',
        returnPolicy: { accepted: false },
      });
      const row = costsRow(renderer)!;
      expect(row.props.accessibilityLabel).toBe('Costs & buyer protection');
      act(() => renderer.unmount());
    });
  });

  describe('single ownership — no duplicated copy across entry points', () => {
    it('states each delivery/returns fact exactly once across the composed section', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        estimatedTotal: 48.5,
        buyerProtectionFee: 3.5,
        shippingPayer: 'buyer',
        shippingPrice: 3.49,
        shippingMethod: 'Royal Mail',
        protectionPolicy: { available: true, label: 'Buyer Protection', summary: 'x' },
        returnPolicy: { accepted: true, windowDays: 14 },
      });
      // Return-policy wording appears only inside the shipping disclosure.
      expect(countOccurrences(renderer, '14-day returns')).toBe(1);
      // The paid-shipping amount appears only inside the shipping disclosure.
      expect(countOccurrences(renderer, '£3.49')).toBe(1);
      act(() => renderer.unmount());
    });

    it('states a no-returns decision fact exactly once even when terms exist', () => {
      const { renderer } = renderSection({
        ...baseCommerce,
        estimatedTotal: 45,
        shippingPayer: 'seller',
        protectionPolicy: { available: true, label: 'Buyer Protection', summary: 'x' },
        returnPolicy: { accepted: false },
      });
      expect(countOccurrences(renderer, 'No returns')).toBe(1);
      expect(costsRow(renderer)!.props.accessibilityLabel.toLowerCase()).not.toContain('return');
      act(() => renderer.unmount());
    });
  });

  it('renders nothing when the derivation gate is empty', () => {
    const { renderer } = renderSection(baseCommerce, { purchaseSummary: '' });
    expect(buttons(renderer)).toHaveLength(0);
    expect(getAllText(renderer)).toHaveLength(0);
    act(() => renderer.unmount());
  });
});

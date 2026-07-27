import { describe, it, expect, vi } from 'vitest';
import React from 'react';
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

// Mock useReducedMotion — return true to skip Reanimated animations
vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

// Mock useHaptic
vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({ light: () => {}, medium: () => {}, heavy: () => {} }),
}));

import { CommerceDetailSection } from '../components/commerce/detail/CommerceDetailSection';
import { CommerceDetailIdentity } from '../components/commerce/detail/CommerceDetailIdentity';
import { CommerceDetailStateDock } from '../components/commerce/detail/CommerceDetailStateDock';
import { CommerceDetailTransactionSurface } from '../components/commerce/detail/CommerceDetailTransactionSurface';

function renderTree(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer!;
}

function findTextInstances(node: TestRenderer.ReactTestInstance | string | null): string[] {
  if (typeof node === 'string') return [node];
  if (!node || typeof node === 'string') return [];
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

describe('commerce-detail runtime tests (react-test-renderer)', () => {
  // ── CommerceDetailSection ──
  describe('CommerceDetailSection', () => {
    it('renders a standard section with label and children', () => {
      const renderer = renderTree(
        <CommerceDetailSection label="Item details">
          <React.Fragment>Content here</React.Fragment>
        </CommerceDetailSection>
      );
      expect(hasText(renderer, 'Item details')).toBe(true);
      expect(hasText(renderer, 'Content here')).toBe(true);
    });

    it('continuation variant renders no heading', () => {
      const renderer = renderTree(
        <CommerceDetailSection label="Should not appear" variant="continuation">
          <React.Fragment>Continuation content</React.Fragment>
        </CommerceDetailSection>
      );
      expect(hasText(renderer, 'Should not appear')).toBe(false);
      expect(hasText(renderer, 'Continuation content')).toBe(true);
    });

    it('editorial variant renders a stronger heading', () => {
      const renderer = renderTree(
        <CommerceDetailSection label="Editorial heading" variant="editorial">
          <React.Fragment>Body</React.Fragment>
        </CommerceDetailSection>
      );
      expect(hasText(renderer, 'Editorial heading')).toBe(true);
    });

    it('compact variant suppresses divider', () => {
      const renderer = renderTree(
        <CommerceDetailSection label="Compact" divider variant="compact">
          <React.Fragment>Body</React.Fragment>
        </CommerceDetailSection>
      );
      expect(hasText(renderer, 'Compact')).toBe(true);
    });
  });

  // ── CommerceDetailIdentity ──
  describe('CommerceDetailIdentity', () => {
    it('renders eyebrow and title', () => {
      const renderer = renderTree(
        <CommerceDetailIdentity
          eyebrow="Nike"
          title="Air Max 90"
          secondaryLine="Excellent · Size 10"
        />
      );
      expect(hasText(renderer, 'Nike')).toBe(true);
      expect(hasText(renderer, 'Air Max 90')).toBe(true);
    });

    it('direct family shows primaryValue', () => {
      const renderer = renderTree(
        <CommerceDetailIdentity
          family="direct"
          eyebrow="Nike"
          title="Air Max 90"
          primaryValue="£120"
        />
      );
      expect(hasText(renderer, '£120')).toBe(true);
    });

    it('auction family suppresses primaryValue', () => {
      const renderer = renderTree(
        <CommerceDetailIdentity
          family="auction"
          eyebrow="Nike"
          title="Air Max 90"
          primaryValue="£120"
        />
      );
      expect(hasText(renderer, '£120')).toBe(false);
    });

    it('co_own family suppresses primaryValue', () => {
      const renderer = renderTree(
        <CommerceDetailIdentity
          family="co_own"
          eyebrow="Watches"
          title="Rolex Submariner"
          primaryValue="£25/unit"
        />
      );
      expect(hasText(renderer, '£25/unit')).toBe(false);
    });

    it('compact density renders without error', () => {
      const renderer = renderTree(
        <CommerceDetailIdentity
          family="direct"
          density="compact"
          eyebrow="Nike"
          title="Air Max 90"
          primaryValue="£120"
        />
      );
      expect(hasText(renderer, 'Air Max 90')).toBe(true);
    });
  });

  // ── CommerceDetailStateDock ──
  describe('CommerceDetailStateDock', () => {
    it('renders value, valueLabel, and primary actions', () => {
      const renderer = renderTree(
        <CommerceDetailStateDock
          value="£120"
          valueLabel="Min next bid"
          primaryAction={{
            label: 'Place bid',
            onPress: () => {},
          }}
        />
      );
      expect(hasText(renderer, '£120')).toBe(true);
      expect(hasText(renderer, 'Min next bid')).toBe(true);
      expect(hasText(renderer, 'Place bid')).toBe(true);
    });

    it('renders secondary action', () => {
      const renderer = renderTree(
        <CommerceDetailStateDock
          value="£120"
          valueLabel="Unit price"
          primaryAction={{
            label: 'Buy units',
            onPress: () => {},
          }}
          secondaryAction={{
            label: 'Sell',
            onPress: () => {},
          }}
        />
      );
      expect(hasText(renderer, 'Buy units')).toBe(true);
      expect(hasText(renderer, 'Sell')).toBe(true);
    });

    it('renders state badge for blocked state', () => {
      const renderer = renderTree(
        <CommerceDetailStateDock
          stateBadge="Trading unavailable"
          subtitle="Complete rights disclosure"
          primaryAction={{
            label: 'Review rights',
            onPress: () => {},
          }}
        />
      );
      expect(hasText(renderer, 'Trading unavailable')).toBe(true);
      expect(hasText(renderer, 'Complete rights disclosure')).toBe(true);
      expect(hasText(renderer, 'Review rights')).toBe(true);
    });

    it('shows loading state on primary action', () => {
      const renderer = renderTree(
        <CommerceDetailStateDock
          value="£120"
          valueLabel="Price"
          primaryAction={{
            label: 'Buy now',
            onPress: () => {},
            loading: true,
          }}
        />
      );
      expect(hasText(renderer, '…')).toBe(true);
    });

    it('renders without error when disabled', () => {
      const renderer = renderTree(
        <CommerceDetailStateDock
          value="£120"
          valueLabel="Price"
          primaryAction={{
            label: 'Buy now',
            onPress: () => {},
            disabled: true,
          }}
        />
      );
      expect(hasText(renderer, 'Buy now')).toBe(true);
    });
  });

  // ── CommerceDetailTransactionSurface ──
  describe('CommerceDetailTransactionSurface', () => {
    it('renders primary label, value, and secondary', () => {
      const renderer = renderTree(
        <CommerceDetailTransactionSurface
          family="auction"
          primaryLabel="Current bid"
          primaryValue="£85"
          secondaryLabel="Bids"
          secondaryValue="12 bids"
        />
      );
      expect(hasText(renderer, 'Current bid')).toBe(true);
      expect(hasText(renderer, '£85')).toBe(true);
      expect(hasText(renderer, '12 bids')).toBe(true);
    });

    it('renders direct family with near-flat container', () => {
      const renderer = renderTree(
        <CommerceDetailTransactionSurface
          family="direct"
          primaryLabel="Price"
          primaryValue="£120"
        />
      );
      expect(hasText(renderer, 'Price')).toBe(true);
      expect(hasText(renderer, '£120')).toBe(true);
    });

    it('renders co_own family with structured market grid', () => {
      const renderer = renderTree(
        <CommerceDetailTransactionSurface
          family="co_own"
          primaryLabel="Reference unit price"
          primaryValue="£25"
        >
          <React.Fragment>Market grid content</React.Fragment>
        </CommerceDetailTransactionSurface>
      );
      expect(hasText(renderer, 'Reference unit price')).toBe(true);
      expect(hasText(renderer, '£25')).toBe(true);
      expect(hasText(renderer, 'Market grid content')).toBe(true);
    });
  });
});

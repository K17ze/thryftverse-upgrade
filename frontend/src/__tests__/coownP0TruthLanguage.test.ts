import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── P0.3: truth language in CoOwnTradeComposer ──
//
// DEFECT: CoOwnTradeComposer.tsx (line 229) always shows:
//   "Illustrative — not live market data. Actual fill depends on the real
//    order book at execution."
// even when the order book IS live. The fill estimate header (line 237) also
// says "Estimated fill (illustrative)" unconditionally. This is misleading:
// when the data comes from a live, reconciled order book, the fill estimate
// is a real preview, not illustrative.
//
// FIX: The component should accept a prop indicating whether the book data is
// live or a development fallback. The "Illustrative" disclaimer should only
// appear for development-fallback data. For live data, the fill estimate
// section should show "Live estimate" instead.
//
// After-fix: CoOwnTradeComposer accepts `bookSource?: 'live' | 'development-fallback'`
// (or equivalent) and conditions the copy on that prop.

function readSrc(filePath: string): string {
  return readFileSync(resolve(__dirname, '..', filePath), 'utf-8');
}

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
    successSubtle: '#e6f5ec',
    successBorder: '#b3dcc6',
    warning: '#ff9900',
    warningSubtle: '#fff4e6',
    warningBorder: '#ffd9b3',
    danger: '#cc0000',
    dangerSubtle: '#fce8e8',
    dangerBorder: '#f0b3b3',
    coownUp: '#00aa44',
    coownUpSubtle: '#e6f5ec',
    coownDown: '#cc0000',
    coownDownSubtle: '#fce8e8',
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

// Mock CoOwnNumericText to avoid deep dependency chains
vi.mock('../components/ui/CoOwnNumericText', () => {
  const React = require('react');
  return {
    CoOwnNumericText: (props: any) =>
      React.createElement('Text', null, String(props.value)),
  };
});

// Mock CoOwnDepthPreview to isolate the composer's own text
vi.mock('../components/coown/CoOwnDepthPreview', () => {
  const React = require('react');
  return {
    CoOwnDepthPreview: (props: any) =>
      React.createElement('CoOwnDepthPreview', null),
  };
});

import { CoOwnTradeComposer } from '../components/coown/CoOwnTradeComposer';

function renderTree(el: React.ReactElement): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer!;
}

/** Expand the "Details" section so the fill-estimate copy is rendered. */
function expandDetails(renderer: TestRenderer.ReactTestRenderer): void {
  // The details toggle is a Pressable with accessibilityLabel "Expand details"
  const toggle = renderer.root.findByProps({ accessibilityLabel: 'Expand details' });
  act(() => {
    toggle.props.onPress();
  });
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

const LIVE_FILL_ESTIMATE = {
  avgFillPrice: 10.5,
  worstPrice: 10.8,
  unitsFilled: 3,
  slippageBeyondDepth: false,
  gross: 31.5,
};

const BASE_PROPS = {
  imageUri: null,
  title: 'Test Asset',
  side: 'buy' as const,
  mode: 'market' as const,
  units: 3,
  unitPriceLabel: '10.00',
  grossLabel: '30.00',
  feeLabel: '0.30',
  totalLabel: '30.30',
  totalCaption: 'Including 1% fee',
  settlementLabel: '1ZE',
  availableUnits: 100,
  sellableUnits: 0,
  maxUnits: 20,
  fillEstimate: LIVE_FILL_ESTIMATE,
};

describe('P0.3: CoOwnTradeComposer truth language', () => {
  // ── Document the current bug ──

  it('DOCUMENTS BUG: shows "Illustrative — not live market data" unconditionally', () => {
    // The current component always shows the illustrative disclaimer when
    // fillEstimate is present, even when the data is live.
    const src = readSrc('components/coown/CoOwnTradeComposer.tsx');
    expect(src).toContain('Illustrative — not live market data');
  });

  it('DOCUMENTS BUG: fill estimate header says "Estimated fill (illustrative)"', () => {
    const src = readSrc('components/coown/CoOwnTradeComposer.tsx');
    expect(src).toContain('Estimated fill (illustrative)');
  });

  it('FIX: CoOwnTradeComposer now has a bookSource prop', () => {
    // After the fix, the component accepts a bookSource prop to determine
    // whether the data is live or a development fallback.
    const src = readSrc('components/coown/CoOwnTradeComposer.tsx');
    expect(src).toContain('bookSource');
  });

  // ── After-fix: live data should not show "Illustrative" disclaimer ──

  it('FIX: CoOwnTradeComposer accepts a bookSource prop', () => {
    const src = readSrc('components/coown/CoOwnTradeComposer.tsx');
    expect(src).toContain('bookSource');
  });

  it('FIX: does NOT show "Illustrative — not live market data" when book is live', () => {
    // After the fix, when bookSource is 'live', the illustrative disclaimer
    // must not appear in the rendered output — even when details are expanded.
    const renderer = renderTree(
      React.createElement(CoOwnTradeComposer, {
        ...BASE_PROPS,
        bookSource: 'live' as const,
      })
    );
    expandDetails(renderer);
    const allText = getAllText(renderer).join(' ');
    expect(allText).not.toContain('Illustrative — not live market data');
    expect(allText).not.toContain('not live market data');
  });

  it('FIX: shows "Live estimate" header when book is live', () => {
    // After the fix, the fill estimate section should say "Live estimate"
    // (or equivalent) when the book is live, not "Estimated fill (illustrative)".
    const renderer = renderTree(
      React.createElement(CoOwnTradeComposer, {
        ...BASE_PROPS,
        bookSource: 'live' as const,
      })
    );
    expandDetails(renderer);
    const allText = getAllText(renderer).join(' ');
    expect(allText).toContain('Live estimate');
  });

  it('FIX: does NOT show "illustrative" in fill estimate header when live', () => {
    const renderer = renderTree(
      React.createElement(CoOwnTradeComposer, {
        ...BASE_PROPS,
        bookSource: 'live' as const,
      })
    );
    expandDetails(renderer);
    const allText = getAllText(renderer).join(' ');
    expect(allText).not.toMatch(/Estimated fill \(illustrative\)/);
  });

  // ── After-fix: development-fallback data should still show the disclaimer ──

  it('FIX: shows "Illustrative" disclaimer when book is development-fallback', () => {
    // The disclaimer should still appear for development-fallback data —
    // that is the case where it is truthful.
    const renderer = renderTree(
      React.createElement(CoOwnTradeComposer, {
        ...BASE_PROPS,
        bookSource: 'development-fallback' as const,
      })
    );
    expandDetails(renderer);
    const allText = getAllText(renderer).join(' ');
    expect(allText).toContain('Illustrative');
  });

  it('FIX: shows "Estimated fill (illustrative)" when book is development-fallback', () => {
    const renderer = renderTree(
      React.createElement(CoOwnTradeComposer, {
        ...BASE_PROPS,
        bookSource: 'development-fallback' as const,
      })
    );
    expandDetails(renderer);
    const allText = getAllText(renderer).join(' ');
    expect(allText).toMatch(/illustrative/i);
  });

  // ── TradeScreen integration ──

  it('FIX: TradeScreen passes bookSource to CoOwnTradeComposer', () => {
    // After the fix, TradeScreen should pass the order book's source to the
    // composer so it can condition the copy correctly.
    const src = readSrc('screens/TradeScreen.tsx');
    expect(src).toContain('bookSource');
  });

  it('FIX: TradeScreen passes orderBook.source to bookSource', () => {
    const src = readSrc('screens/TradeScreen.tsx');
    // The source should be derived from the order book snapshot's source field
    expect(src).toMatch(/bookSource.*orderBook.*source|orderBook.*source.*bookSource/);
  });
});

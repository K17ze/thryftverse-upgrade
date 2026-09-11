import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({ colors: {}, isDark: false, themePreference: 'light', resolvedTheme: 'light', setThemePreference: () => {} }),
}));
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../services/marketApi', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual };
});
vi.mock('../components/coown', () => {
  const React = require('react');
  return {
    CoOwnCandleChart: () => React.createElement('View'),
    CoOwnOrderBook: () => React.createElement('View'),
    CoOwnCorporateActionRow: () => React.createElement('View'),
  };
});
vi.mock('expo-video', () => ({ useVideoPlayer: () => ({}), VideoView: () => null }));
vi.mock('@shopify/flash-list', () => ({ FlashList: () => null }));
vi.mock('react-native-gesture-handler', () => ({ GestureDetector: () => null, Gesture: { Pan: () => ({}) }, FlatList: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('../components/BottomSheet', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

describe('diag', () => {
  it('imports AssetOverviewSection', async () => {
    const mod = await import('../components/coown/asset-detail/AssetOverviewSection');
    expect(mod.AssetOverviewSection).toBeDefined();
  });
  it('imports AssetMarketSection', async () => {
    const mod = await import('../components/coown/asset-detail/AssetMarketSection');
    expect(mod.AssetMarketSection).toBeDefined();
  });
  it('imports AssetOwnershipSection', async () => {
    const mod = await import('../components/coown/asset-detail/AssetOwnershipSection');
    expect(mod.AssetOwnershipSection).toBeDefined();
  });
});

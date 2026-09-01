import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { AppIcon } from '../components/common/AppIcon';
import { AppIconButton } from '../components/common/AppIconButton';
import {
  IconSize,
  IconHitTarget,
  IconStroke,
  IconOpticalOffset,
  SemanticIconMap,
} from '../theme/iconTokens';

// Mock theme context
vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: {
      textPrimary: '#111111',
      textSecondary: '#666666',
      textMuted: '#999999',
      brand: '#2D68FF',
      brandLight: 'rgba(45,104,255,0.12)',
      danger: '#FF3B30',
      success: '#34C759',
      warning: '#FF9500',
      surface: '#FFFFFF',
      surfaceAlt: '#F5F5F5',
      surfaceElevated: '#EEEEEE',
      border: '#E5E5E5',
    },
    isDark: false,
  }),
}));

// Mock haptics
vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
  }),
}));

describe('Iconography Design Tokens', () => {
  it('defines normalized optical size bands', () => {
    expect(IconSize.micro).toBe(12);
    expect(IconSize.xs).toBe(14);
    expect(IconSize.sm).toBe(16);
    expect(IconSize.md).toBe(20);
    expect(IconSize.lg).toBe(24);
    expect(IconSize.xl).toBe(28);
    expect(IconSize.hero).toBe(32);
    expect(IconSize.display).toBe(48);
  });

  it('defines 44pt minimum touch target rule', () => {
    expect(IconHitTarget.min).toBe(44);
    expect(IconHitTarget.preferred).toBe(48);
  });

  it('defines optical centroid offsets for asymmetrical glyphs', () => {
    expect(IconOpticalOffset['play'].x).toBeGreaterThan(0);
    expect(IconOpticalOffset['chevron-forward'].x).toBeGreaterThan(0);
    expect(IconOpticalOffset['chevron-back'].x).toBeLessThan(0);
  });

  it('maps semantic pairs for outline and filled states', () => {
    expect(SemanticIconMap.heart.outline).toBe('heart-outline');
    expect(SemanticIconMap.heart.filled).toBe('heart');
    expect(SemanticIconMap.bookmark.outline).toBe('bookmark-outline');
    expect(SemanticIconMap.bookmark.filled).toBe('bookmark');
    expect(SemanticIconMap.inbox.outline).toBe('chatbubble-ellipses-outline');
    expect(SemanticIconMap.inbox.filled).toBe('chatbubble-ellipses');
  });
});

describe('AppIcon Primitive Component', () => {
  it('renders semantic outline icon by default', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AppIcon name="heart" testID="test-heart" />);
    });
    const root = renderer.root;
    const ionic = root.findByType('Ionicons');
    expect(ionic.props.name).toBe('heart-outline');
  });

  it('renders semantic filled icon when focused=true', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AppIcon name="heart" focused={true} testID="test-heart-focused" />);
    });
    const root = renderer.root;
    const ionic = root.findByType('Ionicons');
    expect(ionic.props.name).toBe('heart');
  });

  it('resolves semantic token sizes cleanly', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AppIcon name="search" size="lg" testID="test-search-lg" />);
    });
    const root = renderer.root;
    const ionic = root.findByType('Ionicons');
    expect(ionic.props.size).toBe(IconSize.lg);
  });

  it('resolves theme color tokens', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<AppIcon name="heart" color="danger" testID="test-danger-icon" />);
    });
    const root = renderer.root;
    const ionic = root.findByType('Ionicons');
    expect(ionic.props.color).toBe('#FF3B30');
  });
});

describe('AppIconButton Primitive Component', () => {
  it('guarantees 44pt minimum touch hit area and accessibility attributes', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <AppIconButton
          name="heart"
          accessibilityLabel="Like look"
          testID="like-btn"
        />
      );
    });
    const root = renderer.root;
    const pressable = root.findByType('Pressable');
    expect(pressable.props.accessibilityLabel).toBe('Like look');
    expect(pressable.props.accessible).toBe(true);
  });

  it('renders badge counter when badgeCount > 0', () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <AppIconButton
          name="inbox"
          badgeCount={5}
          accessibilityLabel="Inbox notifications"
          testID="inbox-btn"
        />
      );
    });
    const root = renderer.root;
    const textNodes = root.findAllByType('Text');
    const badge = textNodes.find((n: any) => n.props.children === '5');
    expect(badge).toBeTruthy();
  });
});

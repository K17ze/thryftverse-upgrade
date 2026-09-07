import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import TestRenderer from 'react-test-renderer';
import { Text, View } from 'react-native';
import { SwipeableMessage } from '../components/SwipeableMessage';

// Mock theme
vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: {
      textPrimary: '#111111',
      textSecondary: '#666666',
      textMuted: '#999999',
      brand: '#2D68FF',
      brandSubtle: 'rgba(45,104,255,0.08)',
      surface: '#FFFFFF',
      surfaceAlt: '#F5F5F5',
      surfaceElevated: '#EEEEEE',
      borderSubtle: '#E5E5E5',
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

// Mock reduced motion
vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

// Mock react-native-gesture-handler
vi.mock('react-native-gesture-handler', () => {
  const panMock = {
    enabled: vi.fn().mockReturnThis(),
    activeOffsetX: vi.fn().mockReturnThis(),
    failOffsetY: vi.fn().mockReturnThis(),
    onUpdate: vi.fn().mockReturnThis(),
    onEnd: vi.fn().mockReturnThis(),
  };
  return {
    Gesture: {
      Pan: () => panMock,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

describe('SwipeableMessage', () => {
  it('renders children cleanly without any static opaque background block', () => {
    const onReply = vi.fn();
    let renderer: any;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <SwipeableMessage isMe={false} onReply={onReply}>
          <View testID="message-content">
            <Text>Incoming message</Text>
          </View>
        </SwipeableMessage>
      );
    });

    const root = renderer.root;
    expect(root.findByProps({ testID: 'message-content' })).toBeTruthy();

    // Verify all Views in the component tree to ensure NO view has a static solid grey block
    // (previously: styles.backgroundRight had width: 100, backgroundColor: colors.brandSubtle)
    const views = root.findAllByType(View);
    for (const v of views) {
      const flatStyle = Array.isArray(v.props.style)
        ? Object.assign({}, ...v.props.style.filter(Boolean))
        : v.props.style || {};

      // Container and action track must NEVER have width: 100 with opaque/subtle background
      if (flatStyle.width === 100) {
        expect(flatStyle.backgroundColor).toBeFalsy();
      }
      if (flatStyle.backgroundColor && flatStyle.backgroundColor !== 'transparent') {
        // Only the compact badge or message content should have a background, never the track
        expect(flatStyle.width).not.toBe(100);
      }
    }
  });

  it('positions action track on the LEFT for incoming messages (isMe: false)', () => {
    let renderer: any;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <SwipeableMessage isMe={false} onReply={vi.fn()}>
          <Text>Incoming</Text>
        </SwipeableMessage>
      );
    });

    // Find the action track view (has pointerEvents="none")
    const track = renderer.root.findByProps({ pointerEvents: 'none' });
    expect(track).toBeTruthy();

    const flatStyle = Array.isArray(track.props.style)
      ? Object.assign({}, ...track.props.style.filter(Boolean))
      : track.props.style || {};

    // For isMe: false, swipe is to the right, so reveal track is on the left
    expect(flatStyle.left).toBeDefined();
    expect(flatStyle.right).toBeUndefined();
    expect(flatStyle.backgroundColor).toBe('transparent');
  });

  it('positions action track on the RIGHT for outgoing messages (isMe: true)', () => {
    let renderer: any;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        <SwipeableMessage isMe={true} onActions={vi.fn()}>
          <Text>Outgoing</Text>
        </SwipeableMessage>
      );
    });

    const track = renderer.root.findByProps({ pointerEvents: 'none' });
    expect(track).toBeTruthy();

    const flatStyle = Array.isArray(track.props.style)
      ? Object.assign({}, ...track.props.style.filter(Boolean))
      : track.props.style || {};

    // For isMe: true, swipe is to the left, so reveal track is on the right
    expect(flatStyle.right).toBeDefined();
    expect(flatStyle.left).toBeUndefined();
    expect(flatStyle.backgroundColor).toBe('transparent');
  });
});

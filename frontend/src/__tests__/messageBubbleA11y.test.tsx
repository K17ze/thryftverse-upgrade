/**
 * Task F — chat accessibility + swipe gesture cleanup (audit findings 21, 22).
 *
 * 21: the bubble Pressable claimed button semantics while exposing only
 *     onLongPress. The bubble is now one accessible node whose named
 *     accessibilityActions mirror the real affordances (activate / reply /
 *     longpress menu / nested media/document/quote controls).
 * 22: SwipeableMessage reset displacement only in onEnd. Commit logic now
 *     lives in onEnd and unconditional reset in onFinalize; the gesture
 *     emits a single threshold haptic instead of threshold + fire.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TestRenderer, { act } from 'react-test-renderer';
import { Pressable } from 'react-native';
import { MessageBubble } from '../components/chat/MessageBubble';
import { SwipeableMessage } from '../components/SwipeableMessage';

/* ── Captured gesture callbacks + shared values + haptic spies ── */
const { panHandlers, sharedValues, hapticSpies } = vi.hoisted(() => ({
  panHandlers: {} as Record<string, any>,
  sharedValues: [] as { value: unknown }[],
  hapticSpies: {
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
  },
}));

vi.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => {
      const gesture: Record<string, unknown> = {};
      for (const name of [
        'enabled',
        'activeOffsetX',
        'activeOffsetY',
        'failOffsetX',
        'failOffsetY',
        'onBegin',
        'onStart',
        'onUpdate',
        'onChange',
        'onEnd',
        'onFinalize',
        'onTouchesDown',
        'onTouchesMove',
        'onTouchesUp',
        'onTouchesCancelled',
      ]) {
        gesture[name] = (cb: unknown) => {
          panHandlers[name] = cb;
          return gesture;
        };
      }
      return gesture;
    },
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Reanimated double that records shared values so tests can assert the
// displacement actually returns to rest on every termination path.
vi.mock('react-native-reanimated', () => {
  const React = require('react');
  const createMock = (name: string) =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(name, { ref, ...props })
    );
  return {
    default: {
      View: createMock('ReanimatedView'),
      Text: createMock('ReanimatedText'),
      createAnimatedComponent: (Comp: any) => Comp,
    },
    useSharedValue: (v: unknown) => {
      const box = { value: v };
      sharedValues.push(box);
      return box;
    },
    useAnimatedStyle: () => ({}),
    interpolate: () => 0,
    Extrapolation: { CLAMP: 'clamp' },
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    runOnJS: (fn: any) => fn,
    Easing: {
      out: (f: any) => f,
      in: (f: any) => f,
      inOut: (f: any) => f,
      cubic: (t: any) => t,
    },
  };
});

vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: {
      brand: '#2D68FF',
      brandSubtle: 'rgba(45,104,255,0.08)',
      surface: '#FFFFFF',
      surfaceAlt: '#F5F5F5',
      surfaceElevated: '#EEEEEE',
      textPrimary: '#111111',
      textSecondary: '#666666',
      textMuted: '#999999',
      textInverse: '#FFFFFF',
      scrimTextTertiary: 'rgba(255,255,255,0.7)',
      border: '#DDDDDD',
      borderSubtle: '#E5E5E5',
      overlay: 'rgba(0,0,0,0.4)',
      danger: '#D64A4A',
      dangerText: '#D64A4A',
      dangerSubtle: 'rgba(214,74,74,0.08)',
      dangerBorder: 'rgba(214,74,74,0.3)',
    },
    isDark: false,
  }),
}));

vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => hapticSpies,
}));

vi.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

vi.mock('../hooks/useMotionConfig', () => ({
  useMotionConfig: () => ({
    isEnabled: false,
    spring: { settle: {}, tap: {}, press: {} },
  }),
}));

vi.mock('../hooks/useMessageTranslation', () => ({
  useMessageTranslation: () => ({
    translatedText: undefined,
    isLoading: false,
    isTranslated: false,
    isForeignLanguage: false,
    sourceLanguageName: undefined,
    error: undefined,
    translate: vi.fn(),
    revert: vi.fn(),
    retry: vi.fn(),
  }),
}));

// Resolve the real English strings from en.json so assertions verify the
// announced copy, not a key pass-through. Mirrors the flattening in
// src/i18n/locales/index.ts (nested groups → dot-notation keys).
vi.mock('../i18n/useAppTranslation', async () => {
  const enJson = (await import('../i18n/locales/en.json')).default as Record<string, unknown>;
  const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(out, flatten(value as Record<string, unknown>, fullKey));
      } else if (typeof value === 'string') {
        out[fullKey] = value;
      }
    }
    return out;
  };
  const messagingStrings = flatten(enJson.messaging as Record<string, unknown>);
  return {
    useAppTranslation: () => ({ t: (key: string) => messagingStrings[key] ?? key }),
  };
});

vi.mock('../i18n/i18n', () => ({
  getI18nLocale: () => 'en',
}));

vi.mock('../context/SettingsPreferencesContext', () => ({
  useSettingsPreferences: () => ({ autoTranslateMessages: false }),
}));

vi.mock('../components/CachedImage', () => ({
  CachedImage: (props: any) => <>{null}</>,
}));

vi.mock('../components/chat/VoiceMessageBubble', () => ({
  VoiceMessageBubble: () => null,
}));

vi.mock('../components/chat/VoiceTranscriptionPanel', () => ({
  VoiceTranscriptionPanel: () => null,
}));

/* ── Helpers ── */

function render(element: React.ReactElement) {
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

/** The bubble's single accessible node — identified by its label. */
function findBubble(root: any, label: string) {
  return root
    .findAllByType(Pressable)
    .find((n: any) => n.props.accessibilityLabel === label);
}

function actionNames(node: any): string[] {
  return (node.props.accessibilityActions ?? []).map((a: any) => a.name);
}

function fire(node: any, actionName: string) {
  act(() => {
    node.props.onAccessibilityAction({ nativeEvent: { actionName } });
  });
}

const baseProps = {
  id: 'm1',
  conversationId: 'c1',
  isMe: false,
  senderLabel: 'Alice',
};

beforeEach(() => {
  for (const key of Object.keys(panHandlers)) delete panHandlers[key];
  sharedValues.length = 0;
  vi.clearAllMocks();
});

/* ── Finding 21: coherent accessible message node ── */

describe('MessageBubble accessibility actions', () => {
  it('announces activate + message-actions for a text bubble and both open the actions menu', () => {
    const onLongPress = vi.fn();
    const { root } = render(
      <MessageBubble {...baseProps} text="Hello there" onLongPress={onLongPress} />
    );

    const bubble = findBubble(root, "Alice's message, Hello there");
    expect(bubble).toBeTruthy();
    expect(bubble.props.accessibilityRole).toBe('button');
    expect(bubble.props.accessibilityHint).toBe('Opens message actions');
    expect(actionNames(bubble)).toEqual(['activate', 'longpress']);
    expect(
      bubble.props.accessibilityActions.find((a: any) => a.name === 'longpress').label
    ).toBe('Show message actions');

    fire(bubble, 'activate');
    fire(bubble, 'longpress');
    expect(onLongPress).toHaveBeenCalledTimes(2);
  });

  it('exposes a labelled reply action wired to the same callback the swipe fires', () => {
    const onReply = vi.fn();
    const onLongPress = vi.fn();
    const { root } = render(
      <SwipeableMessage isMe={false} onReply={onReply}>
        <MessageBubble {...baseProps} text="Hello there" onLongPress={onLongPress} />
      </SwipeableMessage>
    );

    const bubble = findBubble(root, "Alice's message, Hello there");
    const names = actionNames(bubble);
    expect(names).toContain('reply');
    expect(names).toContain('longpress');
    expect(
      bubble.props.accessibilityActions.find((a: any) => a.name === 'reply').label
    ).toBe('Reply');

    fire(bubble, 'reply');
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('does not offer a reply action on my own messages (the swipe opens the same actions menu)', () => {
    const onActions = vi.fn();
    const onLongPress = vi.fn();
    const { root } = render(
      <SwipeableMessage isMe={true} onActions={onActions}>
        <MessageBubble
          {...baseProps}
          isMe={true}
          senderLabel={undefined}
          text="Mine"
          onLongPress={onLongPress}
        />
      </SwipeableMessage>
    );

    const bubble = findBubble(root, 'Your message, Mine');
    expect(actionNames(bubble)).toEqual(['activate', 'longpress']);
  });

  it('keeps nested media controls independently operable and mirrors them as actions', () => {
    const onMediaPress = vi.fn();
    const onLongPress = vi.fn();
    const { root } = render(
      <MessageBubble
        {...baseProps}
        mediaUri="file:///photo.jpg"
        mediaType="image"
        onMediaPress={onMediaPress}
        onLongPress={onLongPress}
      />
    );

    const bubble = findBubble(root, "Alice's message, photo");
    const names = actionNames(bubble);
    expect(names).toContain('openMedia');
    expect(names).toContain('activate');
    expect(bubble.props.accessibilityHint).toBe('Opens the photo');

    // Activate on a media bubble opens the media itself (announced object),
    // not the actions menu.
    fire(bubble, 'activate');
    expect(onMediaPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();

    // The nested control remains a real, independently labelled button.
    const nested = root
      .findAllByType(Pressable)
      .find((n: any) => n.props.accessibilityLabel === 'Open photo');
    expect(nested).toBeTruthy();
    expect(nested.props.accessibilityRole).toBe('button');
  });

  it('mirrors document and replied-message controls as actions', () => {
    const onReplyPress = vi.fn();
    const { root } = render(
      <MessageBubble
        {...baseProps}
        text="see attached"
        documentUri="https://files.example.com/spec.pdf"
        documentName="spec.pdf"
        replyTo={{ senderName: 'Bob', text: 'original' }}
        onReplyPress={onReplyPress}
        onLongPress={vi.fn()}
      />
    );

    const bubble = findBubble(root, "Alice's message, see attached");
    const names = actionNames(bubble);
    expect(names).toContain('openDocument');
    expect(names).toContain('showRepliedMessage');

    fire(bubble, 'showRepliedMessage');
    expect(onReplyPress).toHaveBeenCalledTimes(1);
  });

  it('is not announced as a button when the bubble has no interactions', () => {
    const { root } = render(<MessageBubble {...baseProps} text="Plain" />);
    const bubble = findBubble(root, "Alice's message, Plain");
    expect(bubble.props.accessibilityRole).toBe('text');
    expect(bubble.props.accessibilityActions).toBeUndefined();
  });
});

/* ── Finding 22: gesture cleanup + single haptic ── */

describe('SwipeableMessage gesture lifecycle', () => {
  function renderSwipe(props: Partial<React.ComponentProps<typeof SwipeableMessage>> = {}) {
    return render(
      <SwipeableMessage isMe={false} onReply={vi.fn()} {...props}>
        <MessageBubble {...baseProps} text="Hello" />
      </SwipeableMessage>
    );
  }

  // sharedValues[0] is translateX, sharedValues[1] is hasTriggeredHaptic —
  // SwipeableMessage declares them in that order.
  const translateX = () => sharedValues[0].value as number;
  const hapticFlag = () => sharedValues[1].value as boolean;

  it('returns the row to rest when the gesture finalizes after a committed swipe', () => {
    const onReply = vi.fn();
    renderSwipe({ onReply });

    act(() => panHandlers.onUpdate({ translationX: 100 }));
    expect(translateX()).toBeGreaterThan(0);
    act(() => panHandlers.onEnd({ translationX: 100 }));
    act(() => panHandlers.onFinalize());

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(translateX()).toBe(0);
    expect(hapticFlag()).toBe(false);
  });

  it('resets translation on finalize even when the gesture never ends (cancel/interrupt)', () => {
    const onReply = vi.fn();
    renderSwipe({ onReply });

    act(() => panHandlers.onUpdate({ translationX: 100 }));
    expect(translateX()).toBeGreaterThan(0);
    // Interrupted path: no onEnd — e.g. vertical scroll won the responder.
    act(() => panHandlers.onFinalize());

    expect(onReply).not.toHaveBeenCalled();
    expect(translateX()).toBe(0);
    expect(hapticFlag()).toBe(false);
  });

  it('does not fire the action when released below the threshold', () => {
    const onReply = vi.fn();
    renderSwipe({ onReply });

    act(() => panHandlers.onUpdate({ translationX: 40 }));
    act(() => panHandlers.onEnd({ translationX: 40 }));
    act(() => panHandlers.onFinalize());

    expect(onReply).not.toHaveBeenCalled();
    expect(translateX()).toBe(0);
  });

  it('emits exactly one haptic for a committed swipe (threshold crossing, none on fire)', () => {
    const onReply = vi.fn();
    renderSwipe({ onReply });

    act(() => panHandlers.onUpdate({ translationX: 100 }));
    // Holding past the threshold must not re-fire the commitment haptic.
    act(() => panHandlers.onUpdate({ translationX: 120 }));
    act(() => panHandlers.onEnd({ translationX: 120 }));
    act(() => panHandlers.onFinalize());

    const totalHaptics =
      hapticSpies.light.mock.calls.length +
      hapticSpies.selection.mock.calls.length +
      hapticSpies.medium.mock.calls.length +
      hapticSpies.heavy.mock.calls.length;
    expect(totalHaptics).toBe(1);
    expect(hapticSpies.selection).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it('emits no haptic for a swipe that never crosses the threshold', () => {
    renderSwipe();

    act(() => panHandlers.onUpdate({ translationX: 30 }));
    act(() => panHandlers.onEnd({ translationX: 30 }));
    act(() => panHandlers.onFinalize());

    expect(hapticSpies.selection).not.toHaveBeenCalled();
    expect(hapticSpies.light).not.toHaveBeenCalled();
  });
});

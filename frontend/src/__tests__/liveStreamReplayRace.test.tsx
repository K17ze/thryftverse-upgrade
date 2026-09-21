import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * S20-07 — LiveStreamReplayScreen stale-response guard.
 *
 * The primary replay fetch is epoch-guarded: a response from a superseded
 * session must never overwrite state, and a playback retry must refetch the
 * recording URL through the API path (signed URLs expire — remounting the
 * same URL replays the failure forever).
 *
 * Both tests FAIL on the pre-fix screen: the old load applied whichever
 * fetch resolved last regardless of session, and retry only bumped
 * `playbackAttempt` — remounting the same expired URL.
 */

// ── Service boundary ─────────────────────────────────────────────────────
const fetchSessionReplayMock = vi.fn<(id: string) => Promise<unknown>>();
const fetchPastStreamsMock = vi.fn<() => Promise<unknown[]>>();

vi.mock('../services/liveShoppingApi', () => ({
  fetchSessionReplay: (id: string) => fetchSessionReplayMock(id),
  fetchPastStreams: () => fetchPastStreamsMock(),
}));

vi.mock('../analytics', () => ({
  track: vi.fn(),
  identifyUser: vi.fn(),
  resetIdentity: vi.fn(),
}));

// ── Navigation — the screen is route-driven; sessionId is mutable so a
//    test can simulate pushing a different replay onto the stack. ──
let routeSessionId = 'session-a';

vi.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: { sessionId: routeSessionId } }),
  useNavigation: () => ({
    goBack: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    navigate: vi.fn(),
  }),
}));

// ── Player boundary — capture the source the stage is actually given, and
//    expose the statusChange listener so a test can fail playback. ──
let lastPlayerSource: { uri: string } | null = null;
let statusListener: ((event: { status?: string; error?: unknown }) => void) | null = null;

vi.mock('expo-video', () => {
  const React = require('react');
  return {
    useVideoPlayer: (source: { uri: string }) => {
      lastPlayerSource = source;
      return {
        muted: false,
        loop: false,
        addListener: (_name: string, cb: (e: { status?: string }) => void) => {
          statusListener = cb;
          return { remove: () => { statusListener = null; } };
        },
      };
    },
    VideoView: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('VideoView', { ref, ...props })),
  };
});

// ── Chrome mocks — keep the render shallow; the contract under test is
//    which recording URL reaches the player, not the chrome. ──
vi.mock('../components/flagship', () => {
  const React = require('react');
  return {
    FlagshipScreen: (props: { children?: React.ReactNode; header?: React.ReactNode }) =>
      React.createElement('View', null, props.header, props.children),
    FlagshipHeader: () => null,
    FlagshipState: (props: { title?: string; actionLabel?: string; onAction?: () => void }) =>
      React.createElement('View', null,
        React.createElement('Text', null, props.title),
        props.actionLabel
          ? React.createElement('Pressable', { accessibilityLabel: props.actionLabel, onPress: props.onAction })
          : null),
    SkeletonBlock: () => null,
    SkeletonTextLine: () => null,
  };
});

vi.mock('../components/AnimatedPressable', () => {
  const React = require('react');
  return {
    AnimatedPressable: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('Pressable', { ref, ...props })),
  };
});

vi.mock('../components/common/AppIcon', () => ({ AppIcon: () => null }));
vi.mock('../components/CachedImage', () => {
  const React = require('react');
  return {
    CachedImage: React.forwardRef((props: Record<string, unknown>, ref: unknown) =>
      React.createElement('CachedImage', { ref, ...props })),
  };
});
vi.mock('../components/HorizontalRail', () => {
  const React = require('react');
  return {
    HorizontalRail: (props: { children?: React.ReactNode }) =>
      React.createElement('View', null, props.children),
  };
});
vi.mock('../components/live/SessionCards', () => ({ ReplaySessionCard: () => null }));
vi.mock('../hooks/useConnectivity', () => ({ useConnectivity: () => ({ isOffline: false }) }));
vi.mock('../i18n/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../theme/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: {
      textPrimary: '#000',
      textSecondary: '#111',
      textMuted: '#222',
      scrimTextPrimary: '#fff',
      scrimTextSecondary: '#eee',
      scrimTextTertiary: '#ddd',
      border: '#333',
    },
  }),
}));

import { LiveStreamReplayScreen } from '../screens/LiveStreamReplayScreen';
import type { LiveSessionReplay } from '../services/liveShoppingApi';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const makeReplay = (sessionId: string, recordingUrl: string): LiveSessionReplay => ({
  sessionId,
  title: `Replay ${sessionId}`,
  hostUserId: 'host-1',
  hostUsername: 'host',
  hostAvatarUrl: null,
  hostVerified: false,
  status: 'ended',
  startedAt: '2026-09-20T10:00:00.000Z',
  endedAt: '2026-09-20T11:00:00.000Z',
  thumbnailUrl: null,
  recordingUrl,
  recordingEnabled: true,
  isDemo: false,
});

async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<LiveStreamReplayScreen />);
  });
  return renderer;
}

beforeEach(() => {
  fetchSessionReplayMock.mockReset();
  fetchPastStreamsMock.mockReset().mockResolvedValue([]);
  lastPlayerSource = null;
  statusListener = null;
  routeSessionId = 'session-a';
});

describe('LiveStreamReplayScreen — S20-07 stale-response guard', () => {
  it('a late response from a superseded session never reaches the player', async () => {
    const replayA = deferred<LiveSessionReplay>();
    const replayB = deferred<LiveSessionReplay>();
    fetchSessionReplayMock.mockImplementation((id: string) =>
      id === 'session-a' ? replayA.promise : replayB.promise);

    const renderer = await mount();
    expect(fetchSessionReplayMock).toHaveBeenCalledWith('session-a');

    // Push a different replay — the new session's fetch starts while A's
    // is still in flight.
    routeSessionId = 'session-b';
    await act(async () => {
      renderer.update(<LiveStreamReplayScreen />);
    });
    expect(fetchSessionReplayMock).toHaveBeenCalledWith('session-b');

    // B resolves first — its recording reaches the player.
    await act(async () => {
      replayB.resolve(makeReplay('session-b', 'https://cdn.example/b.m3u8'));
      await Promise.resolve();
    });
    expect(lastPlayerSource?.uri).toBe('https://cdn.example/b.m3u8');

    // A resolves LATE — stale, must be dropped, never overwriting B.
    await act(async () => {
      replayA.resolve(makeReplay('session-a', 'https://cdn.example/a.mp4'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lastPlayerSource?.uri).toBe('https://cdn.example/b.m3u8');
  });

  it('playback retry refetches a fresh recording URL instead of remounting the expired one', async () => {
    fetchSessionReplayMock.mockResolvedValue(
      makeReplay('session-a', 'https://cdn.example/expired.mp4'));

    const renderer = await mount();
    expect(lastPlayerSource?.uri).toBe('https://cdn.example/expired.mp4');
    expect(fetchSessionReplayMock).toHaveBeenCalledTimes(1);

    // Signed URL expired → the player reports a playback error.
    await act(async () => {
      statusListener?.({ status: 'error' });
    });

    // The next fetch returns the same session with a FRESH signed URL.
    fetchSessionReplayMock.mockResolvedValue(
      makeReplay('session-a', 'https://cdn.example/fresh.mp4'));

    const retry = renderer.root.findAll(
      (node) => node.props.accessibilityLabel === 'playbackError.retry' && typeof node.props.onPress === 'function',
    );
    expect(retry.length).toBeGreaterThan(0);
    await act(async () => {
      await retry[0].props.onPress();
    });

    expect(fetchSessionReplayMock).toHaveBeenCalledTimes(2);
    expect(lastPlayerSource?.uri).toBe('https://cdn.example/fresh.mp4');
  });
});

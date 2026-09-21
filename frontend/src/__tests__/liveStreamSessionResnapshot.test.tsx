import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * R8 — useLiveStreamSession resnapshot / reconnecting regression.
 *
 * The realtime transport emits a `resnapshot` signal when the sequence gap
 * on a topic is too large to replay (RealtimeClient.checkAndReplayGaps).
 * The viewer session hook must:
 *   - expose `reconnecting` mirrored from the transport state machine
 *   - refetch the canonical snapshot (session + chat history) on resnapshot
 *   - ignore resnapshot signals addressed to other topics
 *   - never let a superseded resnapshot fetch overwrite newer state
 *
 * These FAIL on the pre-fix hook: it had no onResnapshot subscription and
 * no reconnecting state at all.
 */

// ── Service boundary ─────────────────────────────────────────────────────
const connectToStreamMock = vi.fn<(id: string) => Promise<unknown>>();
const fetchStreamChatHistoryMock = vi.fn<(id: string) => Promise<unknown[]>>();
const disconnectFromStreamMock = vi.fn();

vi.mock('../services/liveShoppingApi', () => ({
  connectToStream: (id: string) => connectToStreamMock(id),
  disconnectFromStream: (id: string) => disconnectFromStreamMock(id),
  fetchStreamChatHistory: (id: string) => fetchStreamChatHistoryMock(id),
  subscribeToStreamEvents: () => () => {},
  subscribeToChat: () => () => {},
  subscribeToViewerCount: () => () => {},
  subscribeToBids: () => () => {},
  subscribeToLotChanges: () => () => {},
  liveSessionTopic: (id: string) => `live.session:${id}`,
}));

vi.mock('../services/profileApi', () => ({
  fetchPublicProfile: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../analytics', () => ({
  track: vi.fn(),
  identifyUser: vi.fn(),
  resetIdentity: vi.fn(),
}));

// ── Realtime boundary — a fake client exposing the state/resnapshot
//    listener contract the hook subscribes to. ──
type StateHandler = (state: string) => void;
type ResnapshotHandler = (topic: string) => void;
const stateHandlers = new Set<StateHandler>();
const resnapshotHandlers = new Set<ResnapshotHandler>();

const fakeRealtimeClient = {
  getState: () => 'connected',
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  on: vi.fn(() => () => {}),
  onStateChange: (handler: StateHandler) => {
    stateHandlers.add(handler);
    return () => { stateHandlers.delete(handler); };
  },
  onResnapshot: (handler: ResnapshotHandler) => {
    resnapshotHandlers.add(handler);
    return () => { resnapshotHandlers.delete(handler); };
  },
};

const emitTransportState = (state: string) =>
  stateHandlers.forEach((handler) => handler(state));
const emitResnapshot = (topic: string) =>
  resnapshotHandlers.forEach((handler) => handler(topic));

vi.mock('../platform/realtime', () => ({
  useRealtimeSafe: () => ({ client: fakeRealtimeClient, connectionState: 'connected' }),
  getRealtimeClient: () => fakeRealtimeClient,
}));

import { useLiveStreamSession } from '../hooks/livestream/useLiveStreamSession';
import type { LiveLot, LiveStream } from '../services/liveShoppingApi';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const makeLot = (overrides: Partial<LiveLot> = {}): LiveLot => ({
  id: 'lot-1',
  listingId: 'listing-1',
  title: 'Vintage chore jacket',
  imageUri: '',
  startingPrice: 40,
  currentPrice: 55,
  bidCount: 3,
  status: 'active',
  ...overrides,
});

const makeStream = (overrides: Partial<LiveStream> = {}): LiveStream => ({
  id: 'session-1',
  sellerId: 'host-1',
  sellerName: 'host',
  title: 'Friday drop',
  status: 'live',
  startedAt: '2026-09-20T10:00:00.000Z',
  viewerCount: 100,
  likeCount: 0,
  currentLotIndex: 0,
  lots: [makeLot()],
  chatEnabled: true,
  isDemo: false,
  ...overrides,
});

type SessionHook = ReturnType<typeof useLiveStreamSession>;
let latest: SessionHook | null = null;

function Harness() {
  latest = useLiveStreamSession('session-1', 'viewer-1');
  return null;
}

async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  return renderer;
}

beforeEach(() => {
  connectToStreamMock.mockReset().mockResolvedValue(makeStream());
  fetchStreamChatHistoryMock.mockReset().mockResolvedValue([]);
  disconnectFromStreamMock.mockReset();
  stateHandlers.clear();
  resnapshotHandlers.clear();
  latest = null;
});

describe('useLiveStreamSession — resnapshot & reconnecting (R8)', () => {
  it('marks the feed reconnecting while the transport recovers', async () => {
    await mount();
    expect(latest?.connectionState).toBe('live');
    expect(latest?.reconnecting).toBe(false);

    await act(async () => {
      emitTransportState('reconnecting');
    });
    expect(latest?.reconnecting).toBe(true);

    await act(async () => {
      emitTransportState('connected');
    });
    expect(latest?.reconnecting).toBe(false);
  });

  it('refetches the canonical snapshot on resnapshot and clears reconnecting', async () => {
    await mount();
    expect(connectToStreamMock).toHaveBeenCalledTimes(1);

    const pendingSnapshot = deferred<LiveStream>();
    connectToStreamMock.mockImplementation(() => pendingSnapshot.promise);

    await act(async () => {
      emitResnapshot('live.session:session-1');
    });

    // The resnapshot kicked off a fresh snapshot fetch while the flag shows
    // the feed is stale.
    expect(connectToStreamMock).toHaveBeenCalledTimes(2);
    expect(fetchStreamChatHistoryMock).toHaveBeenCalledTimes(1); // initial only — pending second call below
    expect(latest?.reconnecting).toBe(true);

    await act(async () => {
      pendingSnapshot.resolve(makeStream({ viewerCount: 250 }));
    });

    expect(fetchStreamChatHistoryMock).toHaveBeenCalledTimes(2);
    expect(latest?.reconnecting).toBe(false);
    expect(latest?.connectionState).toBe('live');
    expect(latest?.viewerCount).toBe(250);
    expect(latest?.stream?.viewerCount).toBe(250);
  });

  it('ignores resnapshot signals addressed to other topics', async () => {
    await mount();
    expect(connectToStreamMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      emitResnapshot('chat.conv-9');
      emitResnapshot('live.session:someone-else');
    });

    expect(connectToStreamMock).toHaveBeenCalledTimes(1);
    expect(latest?.reconnecting).toBe(false);
    expect(latest?.connectionState).toBe('live');
  });

  it('a superseded resnapshot fetch never overwrites the newer snapshot', async () => {
    await mount();

    const first = deferred<LiveStream>();
    const second = deferred<LiveStream>();
    connectToStreamMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    await act(async () => {
      emitResnapshot('live.session:session-1');
      emitResnapshot('live.session:session-1');
    });
    expect(connectToStreamMock).toHaveBeenCalledTimes(3);

    // The newer fetch settles first — its snapshot wins.
    await act(async () => {
      second.resolve(makeStream({ viewerCount: 300 }));
    });
    expect(latest?.viewerCount).toBe(300);
    expect(latest?.reconnecting).toBe(false);

    // The superseded fetch resolves late — epoch-guarded, must be dropped.
    await act(async () => {
      first.resolve(makeStream({ viewerCount: 999 }));
    });
    expect(latest?.viewerCount).toBe(300);
  });

  it('converges to ended when the resnapshot discovers the stream finished', async () => {
    await mount();
    connectToStreamMock.mockResolvedValue(
      makeStream({ status: 'ended', endedAt: '2026-09-20T11:00:00.000Z' }));

    await act(async () => {
      emitResnapshot('live.session:session-1');
    });

    expect(latest?.connectionState).toBe('ended');
    expect(latest?.reconnecting).toBe(false);
  });
});

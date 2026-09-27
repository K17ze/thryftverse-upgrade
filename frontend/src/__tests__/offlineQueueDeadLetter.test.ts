import { beforeEach, describe, expect, it, vi } from 'vitest';

const asyncStorageMock = vi.hoisted(() => ({
  getItem: vi.fn().mockResolvedValue(null),
  setItem: vi.fn().mockResolvedValue(undefined),
  removeItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: asyncStorageMock,
}));

const networkMock = vi.hoisted(() => ({
  getNetworkStateAsync: vi.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  }),
}));

vi.mock('expo-network', () => networkMock);

import {
  selectDeadLetterCount,
  selectPendingCount,
  useOfflineQueue,
} from '../lib/offlineQueue';

function resetQueue() {
  useOfflineQueue.setState({
    queue: [],
    deadLetterQueue: [],
    isProcessing: false,
  });
}

/** Drives a queued request to dead-letter by failing every flush attempt. */
async function exhaustRetries(fetchImpl: () => Promise<Response>) {
  for (let attempt = 0; attempt < 9; attempt += 1) {
    // Bypass backoff gating between synthetic attempts.
    useOfflineQueue.setState((state) => ({
      queue: state.queue.map((req) => ({ ...req, lastAttemptAt: undefined })),
    }));
    await useOfflineQueue.getState().flushQueue(fetchImpl as any);
  }
}

describe('offlineQueue dead-letter handling (R76)', () => {
  beforeEach(() => {
    resetQueue();
    vi.clearAllMocks();
  });

  it('moves a request to the dead-letter queue after exceeding retries', async () => {
    useOfflineQueue.getState().pushToQueue('https://api.test/save', {
      method: 'POST',
      body: JSON.stringify({ listingId: 'l1' }),
    });

    const failingFetch = vi.fn().mockResolvedValue(
      new Response('boom', { status: 500 }),
    );
    await exhaustRetries(failingFetch);

    const state = useOfflineQueue.getState();
    expect(state.queue).toHaveLength(0);
    expect(state.deadLetterQueue).toHaveLength(1);
    expect(state.deadLetterQueue[0].url).toBe('https://api.test/save');
    expect(selectDeadLetterCount(state)).toBe(1);
    expect(selectPendingCount(state)).toBe(0);
  });

  it('persists the dead-letter queue alongside the pending queue', () => {
    const persisted = asyncStorageMock.setItem.mock.calls
      .map(([, value]) => {
        try {
          return JSON.parse(value as string);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .pop();

    useOfflineQueue.setState({
      deadLetterQueue: [
        {
          id: 'dead-1',
          url: 'https://api.test/save',
          options: { method: 'POST' },
          timestamp: 1,
          retryCount: 9,
        },
      ],
    });

    const writes = asyncStorageMock.setItem.mock.calls
      .map(([, value]) => JSON.parse(value as string));
    const lastWrite = writes[writes.length - 1];
    expect(lastWrite.state.deadLetterQueue).toHaveLength(1);
    expect(lastWrite.state).not.toHaveProperty('isProcessing');
    expect(persisted ?? lastWrite).toBeTruthy();
  });

  it('retryDeadLetter requeues with the original request and resets backoff', async () => {
    useOfflineQueue.setState({
      deadLetterQueue: [
        {
          id: 'dead-1',
          url: 'https://api.test/save',
          options: { method: 'POST', body: '{"a":1}' },
          timestamp: 1,
          retryCount: 9,
          lastAttemptAt: 123,
        },
      ],
    });

    useOfflineQueue.getState().retryDeadLetter('dead-1');

    const state = useOfflineQueue.getState();
    expect(state.deadLetterQueue).toHaveLength(0);
    expect(state.queue).toHaveLength(1);
    // Same id/url/options — the replayed request is the same mutation, so
    // server-side idempotency keys in the original body still apply.
    expect(state.queue[0].id).toBe('dead-1');
    expect(state.queue[0].options.body).toBe('{"a":1}');
    expect(state.queue[0].retryCount).toBe(0);
    expect(state.queue[0].lastAttemptAt).toBeUndefined();
  });

  it('retrying triggers an immediate flush using the captured fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    // Seed the captured fetch by running one flush with an empty queue.
    await useOfflineQueue.getState().flushQueue(fetchImpl as any);

    useOfflineQueue.setState({
      deadLetterQueue: [
        {
          id: 'dead-1',
          url: 'https://api.test/retry',
          options: { method: 'POST' },
          timestamp: 1,
          retryCount: 9,
        },
      ],
    });

    useOfflineQueue.getState().retryDeadLetter('dead-1');
    await vi.waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledWith('https://api.test/retry', { method: 'POST' });
    });
    expect(useOfflineQueue.getState().queue).toHaveLength(0);
  });

  it('retryAllDeadLetters requeues every terminal failure', () => {
    useOfflineQueue.setState({
      deadLetterQueue: [
        { id: 'a', url: 'https://api.test/a', options: { method: 'POST' }, timestamp: 1, retryCount: 9 },
        { id: 'b', url: 'https://api.test/b', options: { method: 'PUT' }, timestamp: 2, retryCount: 9 },
      ],
    });

    useOfflineQueue.getState().retryAllDeadLetters();

    const state = useOfflineQueue.getState();
    expect(state.deadLetterQueue).toHaveLength(0);
    expect(state.queue.map((req) => req.id)).toEqual(['a', 'b']);
    expect(state.queue.every((req) => req.retryCount === 0)).toBe(true);
  });

  it('dismissDeadLetter and clearDeadLetters drop failures without requeueing', () => {
    useOfflineQueue.setState({
      deadLetterQueue: [
        { id: 'a', url: 'https://api.test/a', options: { method: 'POST' }, timestamp: 1, retryCount: 9 },
        { id: 'b', url: 'https://api.test/b', options: { method: 'PUT' }, timestamp: 2, retryCount: 9 },
      ],
    });

    useOfflineQueue.getState().dismissDeadLetter('a');
    expect(useOfflineQueue.getState().deadLetterQueue.map((r) => r.id)).toEqual(['b']);
    expect(useOfflineQueue.getState().queue).toHaveLength(0);

    useOfflineQueue.getState().clearDeadLetters();
    expect(useOfflineQueue.getState().deadLetterQueue).toHaveLength(0);
    expect(useOfflineQueue.getState().queue).toHaveLength(0);
  });

  it('clearQueue drops pending writes but preserves dead letters for review', () => {
    useOfflineQueue.setState({
      queue: [
        { id: 'pending', url: 'https://api.test/p', options: { method: 'POST' }, timestamp: 1, retryCount: 0 },
      ],
      deadLetterQueue: [
        { id: 'dead', url: 'https://api.test/d', options: { method: 'POST' }, timestamp: 2, retryCount: 9 },
      ],
    });

    useOfflineQueue.getState().clearQueue();

    const state = useOfflineQueue.getState();
    expect(state.queue).toHaveLength(0);
    expect(state.deadLetterQueue).toHaveLength(1);
  });
});

/**
 * RealtimeProvider — React context provider for the realtime WebSocket client.
 *
 * Wraps the app (inside AuthProvider, outside navigation) and provides a
 * singleton RealtimeClient via context. The client connects automatically
 * when an auth token is available and disconnects on logout.
 *
 * Sequence persistence:
 *   Last-seen sequence numbers are persisted to MMKV so gap detection
 *   works across app restarts. If MMKV is unavailable, sequences are
 *   tracked in-memory only (gaps within a session are still detected).
 *
 * @example
 * ```tsx
 * <RealtimeProvider>
 *   <AppNavigator />
 * </RealtimeProvider>
 * ```
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RealtimeClient } from './RealtimeClient';
import { getApiBaseUrl, getAuthSession } from '../../lib/apiClient';
import { getDefaultStorage, isMMKVAvailable } from '../storage/mmkv';
import type { MMKVInstance } from '../storage/mmkv';
import type { RealtimeConnectionState } from './types';

// ── Context ────────────────────────────────────────────────────────

interface RealtimeContextValue {
  client: RealtimeClient;
  connectionState: RealtimeConnectionState;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

// ── Module-level singleton accessor ─────────────────────────────────
// Allows non-hook modules (e.g. service-layer subscription functions)
// to reach the realtime client without React context. Set by the
// provider on mount; null before the provider has initialised.

let singletonClient: RealtimeClient | null = null;

/** Access the realtime client outside of React hooks. Returns null if
 *  the RealtimeProvider has not mounted yet. */
export function getRealtimeClient(): RealtimeClient | null {
  return singletonClient;
}

// ── Sequence persistence via MMKV ──────────────────────────────────

const SEQ_KEY_PREFIX = 'rt_seq:';

function createSequenceStorage(storage: MMKVInstance | null) {
  if (!storage) return undefined;
  return {
    get: (topic: string): number | undefined => {
      try {
        const raw = storage.getString(`${SEQ_KEY_PREFIX}${topic}`);
        if (raw == null) return undefined;
        const n = Number(raw);
        return Number.isFinite(n) ? n : undefined;
      } catch {
        return undefined;
      }
    },
    set: (topic: string, seq: number): void => {
      try {
        storage.set(`${SEQ_KEY_PREFIX}${topic}`, String(seq));
      } catch {
        // Storage may be full — non-fatal.
      }
    },
  };
}

// ── Provider ───────────────────────────────────────────────────────

export interface RealtimeProviderProps {
  children: ReactNode;
  /** Initial topics to subscribe to on connect (e.g., user notification topic). */
  initialTopics?: string[];
}

export function RealtimeProvider({ children, initialTopics }: RealtimeProviderProps) {
  const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('idle');
  const clientRef = useRef<RealtimeClient | null>(null);

  // Create the client once.
  if (clientRef.current === null) {
    const storage = getDefaultStorage();
    const client = new RealtimeClient({
      apiUrl: getApiBaseUrl(),
      getAccessToken: async () => {
        const session = await getAuthSession();
        return session?.accessToken ?? null;
      },
      initialTopics,
      sequenceStorage: createSequenceStorage(storage),
    });
    clientRef.current = client;
    singletonClient = client;
  }

  const client = clientRef.current;

  // Subscribe to state changes.
  useEffect(() => {
    const unsubscribe = client.onStateChange(setConnectionState);
    return unsubscribe;
  }, [client]);

  // Auto-connect when a token is available, auto-disconnect on logout.
  useEffect(() => {
    let cancelled = false;

    async function checkAuthAndConnect() {
      const session = await getAuthSession();
      if (cancelled) return;

      if (session?.accessToken) {
        // Restore persisted sequences before connecting.
        if (isMMKVAvailable) {
          const storage = getDefaultStorage();
          if (storage) {
            try {
              const allKeys = storage.getAllKeys();
              const seqTopics = allKeys
                .filter((k) => k.startsWith(SEQ_KEY_PREFIX))
                .map((k) => k.slice(SEQ_KEY_PREFIX.length));
              client.restoreSequences(seqTopics);
            } catch {
              // Non-fatal.
            }
          }
        }
        void client.connect();
      } else {
        client.disconnect();
      }
    }

    void checkAuthAndConnect();

    // Poll for auth state changes (the apiClient doesn't expose a subscription).
    // This is lightweight — only checks every 5s.
    const interval = setInterval(() => {
      void checkAuthAndConnect();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [client]);

  // Disconnect on unmount.
  useEffect(() => {
    return () => {
      client.disconnect();
    };
  }, [client]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ client, connectionState }),
    [client, connectionState],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────

/** Access the realtime client and connection state. */
export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return ctx;
}

/** Safe variant of useRealtime that returns null instead of throwing when
 *  the RealtimeProvider is not mounted. Used by chat hooks that should
 *  gracefully degrade when realtime is unavailable rather than crash the
 *  screen. */
export function useRealtimeSafe(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}

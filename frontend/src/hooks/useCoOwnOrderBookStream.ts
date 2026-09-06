import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  fetchCoOwnOrderBook,
  type CoOwnOrderBookSnapshot,
  type CoOwnOrderBookEntry,
} from '../services/marketApi';
import { useRealtimeSafe } from '../platform/realtime';

/**
 * useCoOwnOrderBookStream — snapshot-plus-delta realtime order book.
 *
 * Phase 2: Replaces polling with the app's authenticated realtime client.
 * The client owns WebSocket auth, reconnection, heartbeat and replay; this
 * hook owns the order-book snapshot and applies only contiguous deltas.
 *
 * Protocol:
 * 1. Fetch REST snapshot → set initial book + lastSequence
 * 2. Subscribe to authenticated realtime deltas
 * 3. Apply deltas in strict sequence order
 * 4. On gap (seq > expected): re-fetch snapshot
 * 5. On foreground return: re-fetch snapshot
 * 6. On realtime reconnect: re-fetch snapshot; the shared client resubscribes
 */

export interface CoOwnOrderBookDelta {
  assetId: string;
  sequence: number;
  // Changed levels — each delta updates one price level
  changes: Array<{
    side: 'buy' | 'sell';
    priceGbp: number;
    priceGbpStr?: string;
    units: number;
    orderCount: number;
  }>;
  // Trade events (optional, for UI feedback)
  trades?: Array<{
    units: number;
    priceGbp: number;
  }>;
  serverTimestamp: string;
}

// Asset detail and trade are commonly stacked together in navigation. Keep a
// topic subscribed until the last co-own surface releases it; otherwise
// leaving the trade ticket would silently stop depth updates on the detail
// screen that remains mounted underneath it.
const topicRefCounts = new Map<string, number>();

function retainTopic(client: { subscribe: (topics: string[]) => void; unsubscribe: (topics: string[]) => void }, topic: string) {
  const current = topicRefCounts.get(topic) ?? 0;
  if (current === 0) client.subscribe([topic]);
  topicRefCounts.set(topic, current + 1);
  return () => {
    const next = (topicRefCounts.get(topic) ?? 1) - 1;
    if (next <= 0) {
      topicRefCounts.delete(topic);
      client.unsubscribe([topic]);
    } else {
      topicRefCounts.set(topic, next);
    }
  };
}

export function useCoOwnOrderBookStream(assetId: string | null) {
  const realtime = useRealtimeSafe();
  const realtimeClient = realtime?.client ?? null;
  const [orderBook, setOrderBook] = useState<CoOwnOrderBookSnapshot | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasGap, setHasGap] = useState(false);
  const [hasError, setHasError] = useState(false);
  const lastSequenceRef = useRef<number | null>(null);
  const snapshotRequestRef = useRef(0);

  // Fetch a fresh REST snapshot
  const fetchSnapshot = useCallback(async () => {
    if (!assetId) return;
    const requestId = ++snapshotRequestRef.current;
    try {
      const snapshot = await fetchCoOwnOrderBook(assetId);
      // A previous asset's request may settle after navigation has already
      // switched instruments. Never let that response repaint this book.
      if (requestId !== snapshotRequestRef.current) return;
      setOrderBook(snapshot);
      lastSequenceRef.current = snapshot.snapshotSequence;
      setHasGap(false);
      setHasError(false);
    } catch {
      if (requestId !== snapshotRequestRef.current) return;
      // Network error — keep existing book, mark as not streaming
      setIsStreaming(false);
      setHasError(true);
    }
  }, [assetId]);

  // Apply a delta to the current book
  const applyDelta = useCallback((delta: CoOwnOrderBookDelta) => {
    if (lastSequenceRef.current === null) return; // No snapshot yet

    const expected = lastSequenceRef.current + 1;
    if (delta.sequence < expected) {
      // Duplicate or out-of-order — discard
      return;
    }
    if (delta.sequence > expected) {
      // Gap detected — re-fetch snapshot
      setHasGap(true);
      void fetchSnapshot();
      return;
    }

    // Apply delta — update changed price levels
    setOrderBook(prev => {
      if (!prev) return prev;
      const bids = [...prev.bids];
      const asks = [...prev.asks];
      for (const change of delta.changes) {
        const target = change.side === 'buy' ? bids : asks;
        const existingIdx = target.findIndex(
          l => l.unitPriceGbp === change.priceGbp
        );
        if (change.units === 0) {
          // Level removed
          if (existingIdx >= 0) target.splice(existingIdx, 1);
        } else if (existingIdx >= 0) {
          // Level updated
          target[existingIdx] = {
            ...target[existingIdx],
            units: change.units,
            orderCount: change.orderCount,
            ...(change.priceGbpStr ? { unitPriceGbpStr: change.priceGbpStr } : {}),
          };
        } else {
          // New level — insert in price order
          target.push({
            side: change.side,
            unitPriceGbp: change.priceGbp,
            ...(change.priceGbpStr ? { unitPriceGbpStr: change.priceGbpStr } : {}),
            units: change.units,
            orderCount: change.orderCount,
          });
        }
      }
      // Re-sort: bids descending, asks ascending
      bids.sort((a, b) => b.unitPriceGbp - a.unitPriceGbp);
      asks.sort((a, b) => a.unitPriceGbp - b.unitPriceGbp);

      lastSequenceRef.current = delta.sequence;
      return {
        ...prev,
        bids,
        asks,
        snapshotSequence: delta.sequence,
        eventSequence: delta.sequence,
        serverTimestamp: delta.serverTimestamp,
      };
    });
  }, [fetchSnapshot]);

  // Realtime subscription
  useEffect(() => {
    if (!assetId) {
      snapshotRequestRef.current += 1;
      setOrderBook(null);
      setIsStreaming(false);
      setHasError(false);
      setHasGap(false);
      lastSequenceRef.current = null;
      return;
    }

    // An asset switch must never briefly display the previous instrument's
    // depth while the new snapshot is loading.
    setOrderBook(null);
    setHasError(false);
    setHasGap(false);
    lastSequenceRef.current = null;
    snapshotRequestRef.current += 1;

    // Initial snapshot
    void fetchSnapshot();

    // Subscribe through the shared authenticated realtime client. Its
    // onclose lifecycle handles reconnect and heartbeat; a reconnect or a
    // replay overflow requests a fresh canonical snapshot below.
    if (!realtimeClient) {
      setIsStreaming(false);
      return;
    }
    const topic = `co-own.asset:${assetId}`;
    let cancelled = false;
    setIsStreaming(realtimeClient.getState() === 'connected');
    const unsubscribe = realtimeClient.on<CoOwnOrderBookDelta>(topic, (envelope) => {
      if (cancelled) return;
      if (envelope.type === 'co-own.book-delta' && envelope.payload) {
        applyDelta({
          ...envelope.payload,
          sequence: envelope.seq ?? envelope.payload.sequence,
        });
      } else if (envelope.type === 'co-own.book-updated') {
        void fetchSnapshot();
      }
    });
    const unsubscribeState = realtimeClient.onStateChange((state) => {
      if (cancelled) return;
      const connected = state === 'connected';
      setIsStreaming(connected);
      if (state === 'reconnecting') {
        setHasGap(true);
        void fetchSnapshot();
      }
    });
    const unsubscribeResnapshot = realtimeClient.onResnapshot((resnapshotTopic) => {
      if (cancelled || resnapshotTopic !== topic) return;
      setHasGap(true);
      void fetchSnapshot();
    });
    const releaseTopic = retainTopic(realtimeClient, topic);

    return () => {
      cancelled = true;
      unsubscribe();
      unsubscribeState();
      unsubscribeResnapshot();
      releaseTopic();
    };
  }, [assetId, applyDelta, fetchSnapshot, realtimeClient]);

  // Foreground revalidation
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && assetId) {
        // App returned to foreground — re-fetch snapshot
        void fetchSnapshot();
      }
    });
    return () => subscription?.remove();
  }, [assetId, fetchSnapshot]);

  return {
    orderBook,
    isStreaming,
    hasGap,
    hasError,
    refetch: fetchSnapshot,
  };
}

// Re-export so consumers can import the entry type from this module.
export type { CoOwnOrderBookEntry };

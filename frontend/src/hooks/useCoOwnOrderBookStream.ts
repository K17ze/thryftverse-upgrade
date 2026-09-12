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

/**
 * Socket→state batching window. Book deltas can arrive many times per
 * second during active markets; applying each one as its own setState
 * forces a full quote-strip + ladder re-render per message. Buffering
 * deltas and flushing on a trailing ~90ms edge keeps the UI at ~11
 * renders/second worst-case while remaining visually real-time.
 * Sequence-gap detection is preserved inside the flush — see flushDeltas.
 */
const DELTA_FLUSH_MS = 90;

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
  const [lastSequence, setLastSequence] = useState<number | null>(null);
  const [isForegroundStale, setIsForegroundStale] = useState(false);
  const lastSequenceRef = useRef<number | null>(null);
  const snapshotRequestRef = useRef(0);
  // Delta buffer — flushed on a trailing ~90ms edge (DELTA_FLUSH_MS) so a
  // burst of socket messages collapses into a single setState.
  const pendingDeltasRef = useRef<CoOwnOrderBookDelta[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingDeltas = useCallback(() => {
    pendingDeltasRef.current = [];
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  // Fetch a fresh REST snapshot
  const fetchSnapshot = useCallback(async () => {
    if (!assetId) return;
    const requestId = ++snapshotRequestRef.current;
    try {
      const snapshot = await fetchCoOwnOrderBook(assetId);
      // A previous asset's request may settle after navigation has already
      // switched instruments. Never let that response repaint this book.
      if (requestId !== snapshotRequestRef.current) return;
      // A canonical snapshot supersedes every buffered delta — anything
      // still queued predates or gaps around the new sequence baseline.
      pendingDeltasRef.current = [];
      setOrderBook(snapshot);
      lastSequenceRef.current = snapshot.snapshotSequence;
      setLastSequence(snapshot.snapshotSequence);
      setHasGap(false);
      setHasError(false);
      setIsForegroundStale(false);
    } catch {
      if (requestId !== snapshotRequestRef.current) return;
      // Network error — keep existing book, mark as not streaming
      setIsStreaming(false);
      setHasError(true);
    }
  }, [assetId]);

  // Flush buffered deltas in a single state update. Applies only the
  // contiguous prefix in sequence order; the first gap discards the rest
  // and triggers the canonical resnapshot (reconnect always resnapshots).
  const flushDeltas = useCallback(() => {
    flushTimerRef.current = null;
    const pending = pendingDeltasRef.current;
    pendingDeltasRef.current = [];
    if (pending.length === 0) return;
    if (lastSequenceRef.current === null) return; // No snapshot yet

    // Deltas may arrive out of order inside one flush window — sort by
    // sequence before taking the contiguous prefix.
    pending.sort((a, b) => a.sequence - b.sequence);
    let expected = lastSequenceRef.current + 1;
    const applicable: CoOwnOrderBookDelta[] = [];
    let gapDetected = false;
    for (const delta of pending) {
      if (delta.sequence < expected) continue;      // Duplicate / out-of-order
      if (delta.sequence > expected) { gapDetected = true; break; }
      applicable.push(delta);
      expected = delta.sequence + 1;
    }

    if (applicable.length > 0) {
      const lastApplied = applicable[applicable.length - 1];
      lastSequenceRef.current = lastApplied.sequence;
      setLastSequence(lastApplied.sequence);
      setOrderBook(prev => {
        if (!prev) return prev;
        const bids = [...prev.bids];
        const asks = [...prev.asks];
        let serverTimestamp = prev.serverTimestamp;
        for (const delta of applicable) {
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
          serverTimestamp = delta.serverTimestamp;
        }
        // Re-sort: bids descending, asks ascending
        bids.sort((a, b) => b.unitPriceGbp - a.unitPriceGbp);
        asks.sort((a, b) => a.unitPriceGbp - b.unitPriceGbp);
        return {
          ...prev,
          bids,
          asks,
          snapshotSequence: lastApplied.sequence,
          eventSequence: lastApplied.sequence,
          serverTimestamp,
        };
      });
    }

    if (gapDetected) {
      // Gap detected — re-fetch canonical snapshot
      setHasGap(true);
      void fetchSnapshot();
    }
  }, [fetchSnapshot]);

  // Queue a delta into the batch buffer; flush on the trailing edge.
  const queueDelta = useCallback((delta: CoOwnOrderBookDelta) => {
    pendingDeltasRef.current.push(delta);
    if (flushTimerRef.current === null) {
      flushTimerRef.current = setTimeout(flushDeltas, DELTA_FLUSH_MS);
    }
  }, [flushDeltas]);

  // Realtime subscription
  useEffect(() => {
    clearPendingDeltas();
    if (!assetId) {
      snapshotRequestRef.current += 1;
      setOrderBook(null);
      setIsStreaming(false);
      setHasError(false);
      setHasGap(false);
      setLastSequence(null);
      setIsForegroundStale(false);
      lastSequenceRef.current = null;
      return;
    }

    // An asset switch must never briefly display the previous instrument's
    // depth while the new snapshot is loading.
    setOrderBook(null);
    setHasError(false);
    setHasGap(false);
    setLastSequence(null);
    setIsForegroundStale(false);
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
        queueDelta({
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
      clearPendingDeltas();
      unsubscribe();
      unsubscribeState();
      unsubscribeResnapshot();
      releaseTopic();
    };
  }, [assetId, queueDelta, clearPendingDeltas, fetchSnapshot, realtimeClient]);

  // Foreground revalidation
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && assetId) {
        // App returned to foreground — re-fetch snapshot
        setIsForegroundStale(true);
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
    lastSequence,
    isForegroundStale,
    refetch: fetchSnapshot,
  };
}

// Re-export so consumers can import the entry type from this module.
export type { CoOwnOrderBookEntry };

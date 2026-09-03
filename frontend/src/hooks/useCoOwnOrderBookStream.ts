import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  fetchCoOwnOrderBook,
  type CoOwnOrderBookSnapshot,
  type CoOwnOrderBookEntry,
} from '../services/marketApi';

/**
 * useCoOwnOrderBookStream — snapshot-plus-delta realtime order book.
 *
 * Phase 2: Replaces 10s polling with a WebSocket subscription that
 * receives sequenced deltas. On gap detection or foreground return,
 * falls back to a REST snapshot re-fetch.
 *
 * Protocol:
 * 1. Fetch REST snapshot → set initial book + lastSequence
 * 2. Subscribe to WebSocket deltas
 * 3. Apply deltas in strict sequence order
 * 4. On gap (seq > expected): re-fetch snapshot
 * 5. On foreground return: re-fetch snapshot
 * 6. On WebSocket disconnect: re-fetch snapshot + resubscribe
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

export function useCoOwnOrderBookStream(assetId: string | null) {
  const [orderBook, setOrderBook] = useState<CoOwnOrderBookSnapshot | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasGap, setHasGap] = useState(false);
  const lastSequenceRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch a fresh REST snapshot
  const fetchSnapshot = useCallback(async () => {
    if (!assetId) return;
    try {
      const snapshot = await fetchCoOwnOrderBook(assetId);
      setOrderBook(snapshot);
      lastSequenceRef.current = snapshot.snapshotSequence;
      setHasGap(false);
    } catch {
      // Network error — keep existing book, mark as not streaming
      setIsStreaming(false);
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

  // WebSocket subscription
  useEffect(() => {
    if (!assetId) return;

    // Initial snapshot
    void fetchSnapshot();

    // Subscribe to WebSocket.
    // The backend realtime endpoint is /realtime/ws with ?topics= param.
    // The backend sends RealtimeEnvelope objects: { id, topic, type, payload, seq, timestamp }
    const topic = `co-own.asset:${assetId}`;
    const wsUrl = `${getWsBaseUrl()}/realtime/ws?topics=${encodeURIComponent(topic)}`;

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!cancelled) setIsStreaming(true);
        };

        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const envelope = JSON.parse(event.data);
            // Backend sends RealtimeEnvelope: { type, topic, payload, seq, ... }
            // The delta data lives in envelope.payload
            if (envelope.type === 'co-own.book-delta' && envelope.payload) {
              const delta = envelope.payload as CoOwnOrderBookDelta;
              // Use the envelope's sequence (envelope.seq) as the authoritative sequence
              if (envelope.seq != null) {
                delta.sequence = envelope.seq;
              }
              applyDelta(delta);
            } else if (envelope.type === 'co-own.book-updated' && envelope.payload) {
              // Simpler signal: re-fetch snapshot
              void fetchSnapshot();
            }
          } catch {
            // Malformed message — ignore
          }
        };

        ws.onerror = () => {
          if (!cancelled) setIsStreaming(false);
        };

        ws.onclose = () => {
          if (!cancelled) {
            setIsStreaming(false);
            // Reconnect with backoff
            reconnectTimerRef.current = setTimeout(connect, 3000);
          }
        };
      } catch {
        if (!cancelled) {
          setIsStreaming(false);
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [assetId, applyDelta, fetchSnapshot]);

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
    refetch: fetchSnapshot,
  };
}

// Helper — derive WebSocket base URL from the API base URL
function getWsBaseUrl(): string {
  // In production, this would be wss://api.thryftverse.com
  // In development, it would be ws://localhost:4000
  // The app's existing API client knows the base URL.
  // For now, use a reasonable default that can be overridden.
  if (__DEV__) {
    return 'ws://localhost:4000';
  }
  return 'wss://api.thryftverse.com';
}

// Re-export so consumers can import the entry type from this module.
export type { CoOwnOrderBookEntry };

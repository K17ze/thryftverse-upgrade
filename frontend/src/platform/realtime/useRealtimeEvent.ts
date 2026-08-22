/**
 * useRealtimeEvent — React hook for subscribing to realtime events on a topic.
 *
 * Automatically subscribes to the topic on mount (if not already subscribed)
 * and unsubscribes on unmount. Re-renders the component when new events arrive.
 *
 * @example
 * ```tsx
 * // Live auction bid updates
 * const lastBid = useRealtimeEvent<{ bidAmount: number; bidderId: string }>(
 *   `auction.${auctionId}`,
 *   'bid_placed',
 * );
 *
 * // Live chat messages
 * const lastMessage = useRealtimeEvent<{ text: string; senderId: string }>(
 *   `chat.${conversationId}`,
 *   'message',
 * );
 * ```
 */
import { useEffect, useRef, useState } from 'react';
import { useRealtime } from './RealtimeProvider';
import type { RealtimeEnvelope } from './types';

/**
 * Subscribe to events on a topic and return the latest matching event.
 *
 * @param topic     The realtime topic to subscribe to (e.g., "auction.123").
 * @param eventType Optional event type filter (e.g., "bid_placed"). If omitted, all events on the topic are received.
 * @returns The latest envelope matching the filter, or null if none received yet.
 */
export function useRealtimeEvent<TPayload = Record<string, unknown>>(
  topic: string,
  eventType?: string,
): RealtimeEnvelope<TPayload> | null {
  const { client } = useRealtime();
  const [envelope, setEnvelope] = useState<RealtimeEnvelope<TPayload> | null>(null);
  const topicRef = useRef(topic);
  const typeRef = useRef(eventType);
  topicRef.current = topic;
  typeRef.current = eventType;

  useEffect(() => {
    // Subscribe to the topic on the client.
    client.subscribe([topic]);

    // Register a handler for events on this topic.
    const unsubscribe = client.on<TPayload>(topic, (event) => {
      if (typeRef.current && event.type !== typeRef.current) return;
      setEnvelope(event);
    });

    return () => {
      unsubscribe();
      // Unsubscribe from the topic. The client tracks desired topics —
      // if no other component is listening, this removes it.
      client.unsubscribe([topic]);
    };
  }, [client, topic]);

  return envelope;
}

/**
 * Subscribe to all events on a topic and return an array of all received events.
 * Useful for chat message lists where you need the full history, not just the latest.
 *
 * @param topic     The realtime topic to subscribe to.
 * @param maxEvents Maximum number of events to retain (default 100).
 * @returns Array of received envelopes, oldest first.
 */
export function useRealtimeEventHistory<TPayload = Record<string, unknown>>(
  topic: string,
  maxEvents: number = 100,
): RealtimeEnvelope<TPayload>[] {
  const { client } = useRealtime();
  const [events, setEvents] = useState<RealtimeEnvelope<TPayload>[]>([]);

  useEffect(() => {
    client.subscribe([topic]);

    const unsubscribe = client.on<TPayload>(topic, (event) => {
      setEvents((prev) => {
        const next = [...prev, event];
        if (next.length > maxEvents) {
          return next.slice(next.length - maxEvents);
        }
        return next;
      });
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }, [client, topic, maxEvents]);

  return events;
}

/**
 * Subscribe to the "resnapshot" signal for a specific topic.
 * When emitted, the caller should refetch the canonical state for that topic
 * (e.g., re-fetch auction detail via React Query).
 *
 * @example
 * ```tsx
 * const needsResnapshot = useRealtimeResnapshot(`auction.${auctionId}`);
 * useEffect(() => {
 *   if (needsResnapshot) {
 *     refetch(); // React Query refetch
 *   }
 * }, [needsResnapshot, refetch]);
 * ```
 */
export function useRealtimeResnapshot(topic: string): boolean {
  const { client } = useRealtime();
  const [flag, setFlag] = useState(false);

  useEffect(() => {
    const unsubscribe = client.onResnapshot((resnapshotTopic) => {
      if (resnapshotTopic === topic) {
        setFlag(true);
      }
    });
    return unsubscribe;
  }, [client, topic]);

  return flag;
}

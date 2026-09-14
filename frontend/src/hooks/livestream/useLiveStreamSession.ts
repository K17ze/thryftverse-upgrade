/**
 * useLiveStreamSession — connection lifecycle and realtime subscriptions for
 * the live stream viewer.
 *
 * Owns:
 * - Connection state machine (connecting → live | error | ended)
 * - Stream, current lot, viewer count, chat history + live messages
 * - Seller identity resolution (contract name, else public profile fetch)
 * - Realtime subscriptions: chat, viewer count, bids, lot changes, stream end
 * - Retry / reconnect
 *
 * Truthful UI (AGENTS §11): every value here comes from the realtime
 * contract only — nothing is fabricated for the viewer surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchPublicProfile } from '../../services/profileApi';
import {
  LiveStream,
  LiveLot,
  LiveStreamChatMessage,
  StreamEndEventPayload,
  connectToStream,
  disconnectFromStream,
  subscribeToStreamEvents,
  subscribeToChat,
  subscribeToViewerCount,
  subscribeToBids,
  subscribeToLotChanges,
  fetchStreamChatHistory } from '../../services/liveShoppingApi';
import { track } from '../../analytics';
import type { ConnectionState, SellerIdentity } from './types';

export function useLiveStreamSession(sessionId: string) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [messages, setMessages] = useState<LiveStreamChatMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [sellerIdentity, setSellerIdentity] = useState<SellerIdentity | null>(null);
  const [streamEndSummary, setStreamEndSummary] = useState<StreamEndEventPayload | null>(null);
  const [currentLot, setCurrentLot] = useState<LiveLot | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  // ── Connect to stream on mount ──
  useEffect(() => {
    let cancelled = false;
    let unsubChat: (() => void) | null = null;
    let unsubViewer: (() => void) | null = null;
    let unsubBids: (() => void) | null = null;
    let unsubLotChanges: (() => void) | null = null;
    let unsubLotLifecycle: (() => void) | null = null;
    let unsubStreamEnd: (() => void) | null = null;

    (async () => {
      try {
        const connected = await connectToStream(sessionId);
        if (cancelled) return;
        if (!connected) {
          setConnectionState('error');
          return;
        }

        setStream(connected);
        setViewerCount(connected.viewerCount);
        const lot = connected.lots[connected.currentLotIndex] ?? null;
        setCurrentLot(lot);
        setConnectionState('live');
        track('live_stream_viewed', { stream_id: sessionId });

        // Resolve seller identity: the stream contract carries a name on
        // demo sessions; real sessions only carry hostUserId, so fetch the
        // public profile to fill identity honestly.
        if (!connected.sellerName && connected.sellerId) {
          try {
            const profile = await fetchPublicProfile(connected.sellerId);
            if (!cancelled && profile) {
              setSellerIdentity({
                name: profile.displayName ?? profile.username,
                avatar: profile.avatar,
                verified: profile.sellerVerified ?? profile.identityVerified ?? false,
              });
            }
          } catch {
            // Identity is best-effort — the header simply stays minimal.
          }
        } else if (connected.sellerName) {
          setSellerIdentity({
            name: connected.sellerName,
            avatar: connected.sellerAvatar ?? null,
            verified: connected.sellerVerified ?? false,
          });
        }

        const history = await fetchStreamChatHistory(sessionId);
        if (cancelled) return;
        setMessages(history);

        unsubChat = subscribeToChat(sessionId, (payload) => {
          setMessages((prev) => [...prev.slice(-80), payload.message]);
        });

        unsubViewer = subscribeToViewerCount(sessionId, (payload) => {
          setViewerCount(payload.count);
        });

        unsubBids = subscribeToBids(sessionId, (payload) => {
          setCurrentLot((prev) => {
            if (!prev) return prev;
            // Ignore bid events that race in for a just-closed lot after a
            // lot-change — otherwise they corrupt the new lot's price.
            if (payload.lotId && prev.id !== payload.lotId && prev.listingId !== payload.lotId) {
              return prev;
            }
            return {
              ...prev,
              currentPrice: payload.newCurrentPrice ?? prev.currentPrice,
              bidCount: payload.newBidCount ?? prev.bidCount,
              // A snipe bid may have extended the deadline — keep the
              // countdown anchored to the latest server value.
              closesAt: payload.closesAt !== undefined ? payload.closesAt : prev.closesAt,
              extensionCount: payload.extensionCount ?? prev.extensionCount };
          });
        });

        unsubLotChanges = subscribeToLotChanges(sessionId, (payload) => {
          setCurrentLot({ ...payload.lot });
          setStream((prev) => prev ? { ...prev, currentLotIndex: payload.newLotIndex } : prev);
        });

        // Authoritative lot-engine events: open/close/sold/passed/cancelled
        // carry the lot aggregate; lot.extension (anti-snipe) carries the new
        // deadline at the top level. Both merge into the current lot so the
        // dock countdown and terminal states follow the server.
        unsubLotLifecycle = subscribeToStreamEvents(sessionId, (event) => {
          if (event.type !== 'lot_update') return;
          const raw = event.payload as Record<string, unknown>;
          const dto = (raw.lot ?? null) as {
            id?: string;
            listingId?: string;
            status?: string;
            closesAt?: string | null;
            extensionCount?: number;
            highBidMinor?: number;
          } | null;
          setCurrentLot((prev) => {
            if (!prev) return prev;
            const lotId = dto?.id ?? (raw.lotId as string | undefined);
            const listingId = dto?.listingId ?? (raw.listingId as string | undefined);
            if (listingId !== prev.listingId && lotId !== prev.id) return prev;
            const next = { ...prev };
            if (dto) {
              if (dto.closesAt !== undefined) next.closesAt = dto.closesAt;
              if (typeof dto.extensionCount === 'number') {
                next.extensionCount = dto.extensionCount;
              }
              // high_bid_minor is monotonic server-side — never let an
              // out-of-order event regress the displayed price.
              if (typeof dto.highBidMinor === 'number' && dto.highBidMinor > 0) {
                next.currentPrice = Math.max(prev.currentPrice, dto.highBidMinor / 100);
              }
              if (dto.status === 'open' || dto.status === 'closing') {
                next.status = 'active';
              } else if (dto.status === 'sold') {
                next.status = 'sold';
              } else if (dto.status === 'passed' || dto.status === 'cancelled') {
                next.status = 'passed';
              }
            }
            if (typeof raw.closesAt === 'string' || raw.closesAt === null) {
              next.closesAt = raw.closesAt as string | null;
            }
            if (typeof raw.extensionCount === 'number') {
              next.extensionCount = raw.extensionCount;
            }
            return next;
          });
        });

        unsubStreamEnd = subscribeToStreamEvents(sessionId, (event) => {
          if (event.type === 'stream_end') {
            const summary = event.payload as StreamEndEventPayload;
            setStreamEndSummary(summary);
            setConnectionState('ended');
          }
        });
      } catch {
        if (!cancelled) {
          setConnectionState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubChat?.();
      unsubViewer?.();
      unsubBids?.();
      unsubLotChanges?.();
      unsubLotLifecycle?.();
      unsubStreamEnd?.();
      disconnectFromStream(sessionId);
    };
  }, [sessionId, reconnectCount]);

  const retry = useCallback(() => {
    setConnectionState('connecting');
    setStream(null);
    setMessages([]);
    setStreamEndSummary(null);
    setCurrentLot(null);
    setSellerIdentity(null);
    setReconnectCount((n) => n + 1);
  }, []);

  return {
    connectionState,
    stream,
    messages,
    viewerCount,
    sellerIdentity,
    streamEndSummary,
    currentLot,
    setCurrentLot,
    retry };
}

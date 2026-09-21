/**
 * useLiveStreamSession — connection lifecycle and realtime subscriptions for
 * the live stream viewer.
 *
 * Owns:
 * - Connection state machine (connecting → live | error | ended)
 * - Stream, current lot, viewer count, chat history + live messages
 * - Seller identity resolution (contract name, else public profile fetch)
 * - Realtime subscriptions: chat, viewer count, bids, lot changes, stream end
 * - Transport recovery: `reconnecting` flag from client state, canonical
 *   snapshot refetch when the transport emits a resnapshot signal for the
 *   session topic (gap too large to replay)
 * - Retry / reconnect
 *
 * Truthful UI (AGENTS §11): every value here comes from the realtime
 * contract only — nothing is fabricated for the viewer surface.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  fetchStreamChatHistory,
  liveSessionTopic,
  type ViewerModerationEventPayload } from '../../services/liveShoppingApi';
import { useRealtimeSafe } from '../../platform/realtime';
import { track } from '../../analytics';
import type { ConnectionState, SellerIdentity } from './types';

export function useLiveStreamSession(sessionId: string, viewerUserId?: string) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [messages, setMessages] = useState<LiveStreamChatMessage[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  // Host moderation (R48): true while the server reports this viewer muted —
  // the composer disables and sends are server-rejected anyway.
  const [viewerMuted, setViewerMuted] = useState(false);
  const [sellerIdentity, setSellerIdentity] = useState<SellerIdentity | null>(null);
  const [streamEndSummary, setStreamEndSummary] = useState<StreamEndEventPayload | null>(null);
  const [currentLot, setCurrentLot] = useState<LiveLot | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  // True while the realtime transport is recovering (reconnect backoff or a
  // resnapshot refetch in flight). Mirrored from the shared client — the
  // same pattern useCoOwnOrderBookStream uses for isStreaming/hasGap.
  const [reconnecting, setReconnecting] = useState(false);
  const realtimeClient = useRealtimeSafe()?.client ?? null;
  // Epoch guard for resnapshot refetches — a superseded fetch (overlapping
  // resnapshot signals, or a retry/session switch mid-flight) must never
  // overwrite newer state.
  const resnapshotEpochRef = useRef(0);

  // ── Connect to stream on mount ──
  useEffect(() => {
    let cancelled = false;
    let unsubChat: (() => void) | null = null;
    let unsubViewer: (() => void) | null = null;
    let unsubBids: (() => void) | null = null;
    let unsubLotChanges: (() => void) | null = null;
    let unsubLotLifecycle: (() => void) | null = null;
    let unsubStreamEnd: (() => void) | null = null;
    let unsubModeration: (() => void) | null = null;
    let unsubTransportState: (() => void) | null = null;
    let unsubResnapshot: (() => void) | null = null;

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

        // Non-live sessions render their own states — an ended session gets
        // the ended screen (no summary: stats only exist for a stream the
        // viewer actually watched), a scheduled one the scheduled state.
        if (connected.status === 'ended') {
          setConnectionState('ended');
          return;
        }
        if (connected.status === 'scheduled') {
          setConnectionState('scheduled');
          return;
        }

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
            highBidderId?: string | null;
            winnerId?: string | null;
            orderId?: string | null;
          } | null;
          // lot.opened carries the immutable listing snapshot (title/image).
          const snapshot = (raw.snapshot ?? null) as {
            title?: string;
            imageUrl?: string | null;
          } | null;
          setCurrentLot((prev) => {
            if (!prev) return prev;
            const lotId = dto?.id ?? (raw.lotId as string | undefined);
            const listingId = dto?.listingId ?? (raw.listingId as string | undefined);
            if (listingId !== prev.listingId && lotId !== prev.id && lotId !== prev.lotId) return prev;
            const next = { ...prev };
            if (dto) {
              if (dto.id) next.lotId = dto.id;
              if (dto.closesAt !== undefined) next.closesAt = dto.closesAt;
              if (typeof dto.extensionCount === 'number') {
                next.extensionCount = dto.extensionCount;
              }
              // high_bid_minor is monotonic server-side — never let an
              // out-of-order event regress the displayed price.
              if (typeof dto.highBidMinor === 'number' && dto.highBidMinor > 0) {
                next.currentPrice = Math.max(prev.currentPrice, dto.highBidMinor / 100);
              }
              if (dto.highBidderId !== undefined) next.highBidderId = dto.highBidderId;
              if (dto.status === 'open' || dto.status === 'closing') {
                next.status = 'active';
              } else if (dto.status === 'sold') {
                next.status = 'sold';
              } else if (dto.status === 'passed' || dto.status === 'cancelled') {
                next.status = 'passed';
              }
            }
            // lot.sold carries winnerId both inside the lot dto and at the
            // payload top level; the order link arrives on lot.order_created.
            const winnerId = dto?.winnerId ?? (raw.winnerId as string | null | undefined);
            if (winnerId !== undefined) next.winnerId = winnerId;
            const orderId = dto?.orderId ?? (raw.orderId as string | null | undefined);
            if (orderId) next.orderId = orderId;
            if (snapshot?.title) next.title = snapshot.title;
            if (snapshot?.imageUrl) next.imageUri = snapshot.imageUrl;
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

        // Host viewer moderation (R48): the kick event is how a connected
        // viewer learns they were ejected — the server can't revoke an
        // already-issued token mid-session. Only act when the event targets
        // this viewer; moderation events about other users are ignored.
        unsubModeration = subscribeToStreamEvents(sessionId, (event) => {
          if (!viewerUserId) return;
          if (
            event.type !== 'viewer_kicked' &&
            event.type !== 'viewer_muted' &&
            event.type !== 'viewer_unmuted'
          ) return;
          const payload = event.payload as ViewerModerationEventPayload;
          if (payload.userId !== viewerUserId) return;
          if (event.type === 'viewer_kicked') {
            setConnectionState('removed');
          } else {
            setViewerMuted(event.type === 'viewer_muted');
          }
        });

        // Canonical resnapshot — when the transport drops too many events
        // on this session's topic to replay (gap overflow), refetch the
        // session + chat snapshot rather than trusting accumulated deltas.
        // Epoch-guarded: an older fetch resolving late never overwrites a
        // newer snapshot.
        const resnapshot = async () => {
          const epoch = ++resnapshotEpochRef.current;
          try {
            const snapshot = await connectToStream(sessionId);
            if (cancelled || epoch !== resnapshotEpochRef.current) return;
            if (!snapshot) {
              setConnectionState('error');
              return;
            }
            const history = await fetchStreamChatHistory(sessionId);
            if (cancelled || epoch !== resnapshotEpochRef.current) return;
            setStream(snapshot);
            setViewerCount(snapshot.viewerCount);
            setMessages(history);
            if (snapshot.status === 'ended') {
              setConnectionState('ended');
              return;
            }
            if (snapshot.status === 'scheduled') {
              setConnectionState('scheduled');
              return;
            }
            setCurrentLot(snapshot.lots[snapshot.currentLotIndex] ?? null);
            setConnectionState('live');
          } catch {
            // Keep the last-known state — the subscriptions stay live and
            // the next resnapshot signal or a manual retry recovers.
          } finally {
            if (!cancelled && epoch === resnapshotEpochRef.current) {
              setReconnecting(false);
            }
          }
        };

        // Transport recovery → the feed is stale until replay or a
        // resnapshot lands. 'disconnected' is terminal for the client's
        // backoff, so the flag clears rather than promising a recovery
        // that is no longer running.
        unsubTransportState = realtimeClient?.onStateChange((state) => {
          if (cancelled) return;
          if (state === 'reconnecting') {
            setReconnecting(true);
          } else if (state === 'connected' || state === 'disconnected') {
            setReconnecting(false);
          }
        }) ?? null;

        unsubResnapshot = realtimeClient?.onResnapshot((topic) => {
          if (cancelled || topic !== liveSessionTopic(sessionId)) return;
          setReconnecting(true);
          void resnapshot();
        }) ?? null;
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
      unsubModeration?.();
      unsubTransportState?.();
      unsubResnapshot?.();
      disconnectFromStream(sessionId);
    };
  }, [sessionId, viewerUserId, reconnectCount, realtimeClient]);

  const retry = useCallback(() => {
    // Invalidate any in-flight resnapshot — its writes belong to the
    // session state this retry is about to discard.
    resnapshotEpochRef.current += 1;
    setReconnecting(false);
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
    viewerMuted,
    reconnecting,
    retry };
}

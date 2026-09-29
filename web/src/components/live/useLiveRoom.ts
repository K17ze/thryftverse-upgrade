'use client';

/**
 * useLiveRoom — the live-mode realtime owner behind LiveViewerOverlay,
 * mirroring the mobile app's useLiveStreamSession on web transports:
 *
 *  - Playback: POST /streaming/sessions/:id/token { role: 'viewer' } mints
 *    a subscribe-only LiveKit grant; livekit-client joins the room and the
 *    host's remote video/audio tracks attach to media elements.
 *  - Chat: GET /streaming/sessions/:id/chat for history, POST to send;
 *    the message lands back through the realtime fan-out (deduped by id).
 *  - Presence + lifecycle: the SSE twin GET /realtime/stream?topics=
 *    live.session:{id} carries live.viewer_count.update / live.chat.message
 *    / live.session.ended / live.viewer.{muted,unmuted,kicked} — the same
 *    envelope grammar useCoOwnOrderBookStream reads. Lot-engine events
 *    invalidate the dock's REST queries rather than being patched in.
 *
 * Every value is server truth. A guest gets no token (401), a muted
 * viewer none either (403), a stale live row a 409 — each maps to an
 * honest state; nothing simulates a feed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import {
  ApiRequestError,
  getApiBaseUrl,
  getAuthSession,
  parseApiError,
} from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import type { LiveSession } from '@/lib/data/fixtures-media';
import type { LiveChatMessage } from './useLiveChat';

export type LivePlaybackState =
  /** Hook inactive (fixture mode / demo show) or no session open. */
  | 'idle'
  /** Signed-in account required before the token endpoint will mint. */
  | 'auth'
  /** Token fetch / room join in flight. */
  | 'connecting'
  /** Room joined, host video not on the wire yet. */
  | 'waiting'
  /** Host video track subscribed and attached. */
  | 'watching'
  /** Token denied or the room connect dropped. */
  | 'error'
  /** The show ended (session row or live.session.ended). */
  | 'ended'
  /** This viewer was kicked — or muted, which denies re-entry. */
  | 'removed';

export interface LiveRoomEndSummary {
  totalViewers: number;
  lotsSold: number;
  totalSales: number;
}

interface RealtimeEnvelope {
  topic?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

type LiveKitVideoTrack = import('livekit-client').RemoteVideoTrack;
type LiveKitAudioTrack = import('livekit-client').RemoteAudioTrack;

/** Reconciliation cadence for the REST chat snapshot — SSE appends are the
 *  fast path; this catches whatever a dropped stream missed. Same order as
 *  the hub's session poll. */
const CHAT_RESYNC_MS = 15_000;

export function useLiveRoom(session: LiveSession | null) {
  const { user, isGuest } = useSession();
  const { show } = useToast();
  const qc = useQueryClient();
  // Demo-flagged rows (host-authored fixture shows) never reach a real
  // room — same honest-absence guard the lot dock applies.
  const live =
    DATA_MODE === 'live' && session != null && session.isDemo !== true;
  const sessionId = session?.id ?? null;
  const isLiveNow = session?.status === 'live';
  const myId = user?.id ?? null;

  const [playback, setPlayback] = useState<LivePlaybackState>('idle');
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [muted, setMuted] = useState(false);
  const [endSummary, setEndSummary] = useState<LiveRoomEndSummary | null>(null);
  const [attempt, setAttempt] = useState(0);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const roomRef = useRef<import('livekit-client').Room | null>(null);
  const videoTrackRef = useRef<LiveKitVideoTrack | null>(null);
  const audioTrackRef = useRef<LiveKitAudioTrack | null>(null);
  /** Ids the REST snapshot or this viewer's own POST already rendered —
   *  SSE echoes never double-append. */
  const seenIds = useRef(new Set<string>());
  /** True once a viewer token was minted — only then does the room's
   *  viewer set contain us, so only then do we POST /leave. */
  const joinedRef = useRef(false);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    if (el && videoTrackRef.current) videoTrackRef.current.attach(el);
  }, []);

  const attachAudio = useCallback((el: HTMLAudioElement | null) => {
    audioElRef.current = el;
    if (el && audioTrackRef.current) audioTrackRef.current.attach(el);
  }, []);

  const mapMessage = useCallback(
    (m: liveService.StreamChatMessage): LiveChatMessage => ({
      id: m.id,
      user: m.userName,
      text: m.message,
      kind: m.type === 'message' ? 'chat' : 'system',
      seller: m.isSeller,
      mine: myId != null && m.userId === myId,
    }),
    [myId],
  );

  const appendMessage = useCallback(
    (m: liveService.StreamChatMessage) => {
      if (seenIds.current.has(m.id)) return;
      seenIds.current.add(m.id);
      setMessages((prev) => [...prev.slice(-120), mapMessage(m)]);
    },
    [mapMessage],
  );

  const appendSystemLine = useCallback((id: string, text: string) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, { id, user: '', text, kind: 'system' as const }];
    });
  }, []);

  // ── Chat snapshot — initial history + a slow reconciliation poll. The
  //    endpoint is public (block-filtered for signed-in viewers), so
  //    guests still read the room even without the SSE channel. Replays
  //    get the recorded transcript the same way. ──────────────────────
  useEffect(() => {
    if (!live || !sessionId) {
      setMessages([]);
      return;
    }
    seenIds.current = new Set();
    let cancelled = false;

    const sellerName = session?.sellerName || 'the host';
    const load = async () => {
      try {
        const rows = await liveService.fetchStreamChatMessages(sessionId);
        if (cancelled) return;
        seenIds.current = new Set(rows.map((r) => r.id));
        setMessages([
          {
            id: `${sessionId}-join`,
            user: '',
            text:
              session?.status === 'ended'
                ? 'Chat from the live show'
                : `You joined @${sellerName}’s show`,
            kind: 'system',
          },
          ...rows.map(mapMessage),
        ]);
      } catch {
        // History is best-effort — SSE keeps appending over an empty base.
      }
    };

    void load();
    const poll = window.setInterval(load, CHAT_RESYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, sessionId, mapMessage]);

  // ── SSE session channel — chat, presence, moderation, lifecycle, and
  //    lot-engine signals on `live.session:{id}`. Auth-gated server-side;
  //    guests simply run the REST baseline. A dropped stream reconnects
  //    with backoff and resnapshots chat/lots before trusting appends. ──
  useEffect(() => {
    if (!live || !sessionId || !isLiveNow || isGuest) return;

    const topic = `live.session:${sessionId}`;
    let disposed = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connectAttempt = 0;

    const resnapshot = () => {
      void liveService
        .fetchStreamChatMessages(sessionId)
        .then((rows) => {
          if (disposed) return;
          seenIds.current = new Set(rows.map((r) => r.id));
          setMessages((prev) => [
            ...prev.filter((m) => m.kind === 'system'),
            ...rows.map(mapMessage),
          ]);
        })
        .catch(() => {});
      void qc.invalidateQueries({ queryKey: ['live-current-lot', sessionId] });
      void qc.invalidateQueries({ queryKey: ['live-lots', sessionId] });
      void qc.invalidateQueries({ queryKey: ['live-sessions'] });
    };

    const handleEvent = (event: RealtimeEnvelope) => {
      const payload = event.payload ?? {};
      switch (event.type) {
        case 'live.chat.message': {
          const message = payload.message as
            | liveService.StreamChatMessage
            | undefined;
          if (message?.id) appendMessage(message);
          return;
        }
        case 'live.viewer_count.update': {
          if (typeof payload.count === 'number') setViewerCount(payload.count);
          return;
        }
        case 'live.session.ended': {
          setPlayback('ended');
          setEndSummary({
            totalViewers:
              typeof payload.totalViewers === 'number' ? payload.totalViewers : 0,
            lotsSold: typeof payload.lotsSold === 'number' ? payload.lotsSold : 0,
            totalSales:
              typeof payload.totalSales === 'number' ? payload.totalSales : 0,
          });
          void qc.invalidateQueries({ queryKey: ['live-sessions'] });
          return;
        }
        case 'live.viewer.kicked': {
          if (myId && payload.userId === myId) {
            setPlayback('removed');
            appendSystemLine(
              `${sessionId}-kicked`,
              'The host removed you from this stream',
            );
          }
          return;
        }
        case 'live.viewer.muted': {
          if (myId && payload.userId === myId) {
            setMuted(true);
            appendSystemLine(
              `${sessionId}-muted`,
              'The host muted you — you can watch but not chat',
            );
          }
          return;
        }
        case 'live.viewer.unmuted': {
          if (myId && payload.userId === myId) setMuted(false);
          return;
        }
        default: {
          // Lot-engine traffic (live.bid.placed, live.current_lot.update,
          // lot.*) — invalidate the dock's REST queries rather than
          // hand-patching a partial payload into them.
          if (
            event.type === 'live.bid.placed' ||
            event.type === 'live.current_lot.update' ||
            (event.type?.startsWith('lot.') ?? false)
          ) {
            void qc.invalidateQueries({
              queryKey: ['live-current-lot', sessionId],
            });
            void qc.invalidateQueries({ queryKey: ['live-lots', sessionId] });
          }
        }
      }
    };

    const connect = async () => {
      controller = new AbortController();
      try {
        const auth = await getAuthSession();
        if (disposed || !auth?.accessToken) return;

        const url = `${getApiBaseUrl()}/realtime/stream?topics=${encodeURIComponent(
          topic,
        )}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`stream failed (${response.status})`);
        }

        connectAttempt = 0;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let dataLines: string[] = [];

        const flush = () => {
          if (dataLines.length === 0) return;
          try {
            handleEvent(JSON.parse(dataLines.join('\n')) as RealtimeEnvelope);
          } catch {
            // Malformed frame — the reconnect resnapshot covers the gap.
          }
          dataLines = [];
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done || disposed) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, '');
            buffer = buffer.slice(newline + 1);
            if (line === '') flush();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
          }
        }
      } catch {
        // Intentional abort or a network drop — reconnect below.
      } finally {
        controller = null;
      }

      if (disposed) return;
      // Missed events across the gap — resnapshot before appends resume.
      resnapshot();
      const delayMs = Math.min(1000 * 2 ** connectAttempt, 15_000);
      connectAttempt += 1;
      retryTimer = setTimeout(() => {
        if (!disposed) void connect();
      }, delayMs);
    };

    void connect();

    return () => {
      disposed = true;
      controller?.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, sessionId, isLiveNow, isGuest, myId, qc, attempt]);

  // ── LiveKit viewer join — a viewer token is only minted while the
  //    session is live (409 otherwise) and never for muted viewers (403).
  //    Both failures map to honest states, never a fake feed. ───────────
  useEffect(() => {
    if (!live || !sessionId) {
      setPlayback('idle');
      return;
    }
    if (!isLiveNow) {
      // Ended / upcoming — LivePlayer renders the replay or the honest
      // not-live state; there is no room to join.
      setPlayback(session?.status === 'ended' ? 'ended' : 'idle');
      return;
    }
    if (isGuest) {
      setPlayback('auth');
      return;
    }

    let cancelled = false;
    let room: import('livekit-client').Room | null = null;
    joinedRef.current = false;
    setPlayback('connecting');

    const onVideoTrack = (track: LiveKitVideoTrack | null) => {
      videoTrackRef.current = track;
      if (track && videoElRef.current) track.attach(videoElRef.current);
      if (!track && videoElRef.current) {
        try {
          videoElRef.current.srcObject = null;
        } catch {
          // best-effort detach
        }
      }
      setPlayback((prev) =>
        prev === 'ended' || prev === 'removed'
          ? prev
          : track
            ? 'watching'
            : 'waiting',
      );
    };

    const onAudioTrack = (track: LiveKitAudioTrack | null) => {
      audioTrackRef.current = track;
      if (track && audioElRef.current) track.attach(audioElRef.current);
      if (!track && audioElRef.current) {
        try {
          audioElRef.current.srcObject = null;
        } catch {
          // best-effort detach
        }
      }
    };

    (async () => {
      let join: liveService.StreamJoinToken;
      try {
        join = await liveService.fetchStreamToken(sessionId, 'viewer');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiRequestError) {
          if (error.status === 401) {
            setPlayback('auth');
            return;
          }
          if (error.status === 403) {
            setPlayback('removed');
            return;
          }
          if (error.status === 409) {
            // STREAM_NOT_LIVE — the hub's session row went stale.
            setPlayback('ended');
            return;
          }
        }
        setPlayback('error');
        return;
      }

      if (cancelled) return;
      joinedRef.current = true;

      try {
        const lk = await import('livekit-client');
        if (cancelled) return;

        room = new lk.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        room.on(lk.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === lk.Track.Kind.Video) {
            onVideoTrack(track as LiveKitVideoTrack);
          } else if (track.kind === lk.Track.Kind.Audio) {
            onAudioTrack(track as LiveKitAudioTrack);
          }
        });
        room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind === lk.Track.Kind.Video) onVideoTrack(null);
          else if (track.kind === lk.Track.Kind.Audio) onAudioTrack(null);
        });
        room.on(lk.RoomEvent.Disconnected, () => {
          if (cancelled) return;
          onVideoTrack(null);
          onAudioTrack(null);
          setPlayback((prev) =>
            prev === 'ended' || prev === 'removed' ? prev : 'error',
          );
        });

        await room.connect(join.wsUrl, join.token);
        if (cancelled) {
          await room.disconnect().catch(() => {});
          return;
        }

        // Tracks published before we joined arrive as TrackSubscribed —
        // sweep the publications too so nothing depends on event ordering.
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            const track = publication.track;
            if (!track) continue;
            if (track.kind === lk.Track.Kind.Video) {
              onVideoTrack(track as LiveKitVideoTrack);
            } else if (track.kind === lk.Track.Kind.Audio) {
              onAudioTrack(track as LiveKitAudioTrack);
            }
          }
        }

        setPlayback((prev) =>
          prev === 'connecting' ? 'waiting' : prev,
        );
      } catch {
        if (!cancelled) setPlayback('error');
      }
    })();

    return () => {
      cancelled = true;
      videoTrackRef.current = null;
      audioTrackRef.current = null;
      if (roomRef.current === room) roomRef.current = null;
      if (room) void room.disconnect().catch(() => {});
      // The room's authoritative viewer set only contains us once a token
      // was minted — leave is a no-op for everyone else, so guard anyway.
      if (joinedRef.current && sessionId) {
        joinedRef.current = false;
        void liveService.leaveStreamSession(sessionId).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, sessionId, isLiveNow, isGuest, attempt]);

  // A minted LiveKit token can't be revoked server-side — the kick/mute
  // removal and the ended event are enforced client-side by dropping the
  // room and detaching media the moment the state lands.
  useEffect(() => {
    if (playback !== 'removed' && playback !== 'ended') return;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) void room.disconnect().catch(() => {});
    videoTrackRef.current = null;
    audioTrackRef.current = null;
  }, [playback]);

  // ── Send — POST /streaming/sessions/:id/chat. The persisted row lands
  //    in the rail immediately (deduped when its SSE echo arrives); the
  //    server's rejection reason reaches the toast verbatim. Composer is
  //    withheld entirely where chat can't exist (ended, removed, muted). ──
  const send =
    live && isLiveNow && playback !== 'removed' && playback !== 'ended' && !muted
      ? (text: string) => {
          void liveService
            .sendStreamChatMessage(sessionId as string, text)
            .then((m) => appendMessage(m))
            .catch((error: unknown) => {
              show(parseApiError(error, 'Message was not sent').message, 'error');
            });
        }
      : null;

  return {
    /** True when this hook owns realtime (live backend session open). */
    active: live,
    playback,
    endSummary,
    attachVideo,
    attachAudio,
    /** SSE-verified count when the channel is up; the session row's
     *  server count otherwise — never a simulated drift. */
    viewerCount: live ? viewerCount ?? session?.viewers ?? null : null,
    messages,
    send,
    retry,
  };
}

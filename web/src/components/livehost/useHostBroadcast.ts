'use client';

/**
 * useHostBroadcast — the live-mode realtime owner behind the web host
 * console at /live/host/[id]. Mirrors the mobile useSellerBroadcast on
 * web transports:
 *
 *  - Publish: POST /streaming/sessions/:id/token { role: 'host' } mints a
 *    canPublish LiveKit grant; the room connects and createLocalTracks
 *    publishes the device camera + mic (browser getUserMedia). Permission
 *    denial lands as an honest 'denied' state — the session still runs
 *    chat, lots and moderation (the same degradation as mobile's
 *    'unavailable' publish state).
 *  - Lifecycle: POST /:id/start is the real go-live — the LiveKit webhook
 *    receiver does NOT flip session status, so the explicit call is the
 *    contract. POST /:id/end deletes the provider room and the server
 *    broadcasts live.session.ended with the true totals.
 *  - Realtime: SSE GET /realtime/stream?topics=live.session:{id} — the
 *    topic policy admits the host pre-live (host_user_id), so lot and
 *    moderation events stream during backstage too. Same fetch + Bearer
 *    grammar and reconnect backoff as the viewer's useLiveRoom.
 *  - Moderation: GET /moderation/viewers + mute/unmute/kick POSTs. There
 *    is no viewer-roster endpoint — the chat senders and the muted list
 *    are the actionable targets; kick returns the authoritative
 *    post-kick viewer count.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { getApiBaseUrl, getAuthSession, parseApiError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import type { LiveSession } from '@/lib/data/fixtures-media';
import type { LiveChatMessage } from '@/components/live/useLiveChat';
import type { LiveRoomEndSummary } from '@/components/live/useLiveRoom';

export type HostBroadcastPhase =
  /** Session is created/scheduled — nothing is on air yet. */
  | 'backstage'
  /** Session row is live — the media room may still be connecting. */
  | 'live'
  /** The show ended (session row status or live.session.ended). */
  | 'ended';

export type HostMediaState =
  /** No room attempt yet (backstage) or fully torn down. */
  | 'idle'
  /** Host-token mint / LiveKit connect in flight. */
  | 'connecting'
  /** getUserMedia prompt up, or tracks publishing. */
  | 'requesting'
  /** Camera + mic are published to the room. */
  | 'published'
  /** Camera/mic permission denied, or no device — session stays live. */
  | 'denied'
  /** Token, connect or publish failed for another reason. */
  | 'failed';

/** A viewer the host can act on — sourced from chat senders; there is no
 *  roster endpoint. */
export interface HostChatter {
  userId: string;
  userName: string;
}

interface RealtimeEnvelope {
  topic?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

type LocalVideoTrack = import('livekit-client').LocalVideoTrack;
type LocalAudioTrack = import('livekit-client').LocalAudioTrack;

/** Reconciliation cadence for the REST chat snapshot — SSE appends are
 *  the fast path; same order as the viewer side. */
const CHAT_RESYNC_MS = 15_000;

export function useHostBroadcast(
  session: LiveSession | null,
  /** A host token minted during the access probe (admin path) — reused for
   *  the first room connect so the console never double-mints. */
  preMintedToken?: liveService.StreamJoinToken | null,
) {
  const { user, isGuest } = useSession();
  const { show } = useToast();
  const qc = useQueryClient();
  // Demo-flagged rows (fixture host shows) never reach a real room.
  const active =
    DATA_MODE === 'live' && session != null && session.isDemo !== true;
  const sessionId = session?.id ?? null;
  const myId = user?.id ?? null;

  const [phase, setPhase] = useState<HostBroadcastPhase>(() =>
    session?.status === 'ended'
      ? 'ended'
      : session?.status === 'live'
        ? 'live'
        : 'backstage',
  );
  const [media, setMedia] = useState<HostMediaState>('idle');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [viewerCount, setViewerCount] = useState<number | null>(
    session?.viewers ?? null,
  );
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [chatters, setChatters] = useState<HostChatter[]>([]);
  const [mutedViewers, setMutedViewers] = useState<
    liveService.MutedStreamViewer[]
  >([]);
  const [micMuted, setMicMuted] = useState(false);
  const [camMuted, setCamMuted] = useState(false);
  const [endSummary, setEndSummary] = useState<LiveRoomEndSummary | null>(null);
  const [goingLive, setGoingLive] = useState(false);
  const [goLiveError, setGoLiveError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(() =>
    session?.startedAt ? Date.parse(session.startedAt) : null,
  );
  const [attempt, setAttempt] = useState(0);
  /** Backstage camera check — a plain local getUserMedia preview. Nothing
   *  is published; the copy next to it says so. */
  const [cameraCheck, setCameraCheck] = useState<'idle' | 'on' | 'denied'>(
    'idle',
  );

  const roomRef = useRef<import('livekit-client').Room | null>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const previewElRef = useRef<HTMLVideoElement | null>(null);
  const checkStreamRef = useRef<MediaStream | null>(null);
  const tokenRef = useRef<liveService.StreamJoinToken | null>(
    preMintedToken ?? null,
  );
  /** Chat ids the REST snapshot or a POST already rendered — SSE echoes
   *  never double-append. */
  const seenIds = useRef(new Set<string>());
  const chatterMapRef = useRef(new Map<string, string>());
  /** Bumped on teardown — async connect/publish steps bail out when the
   *  generation moved on (unmount, ended). */
  const generationRef = useRef(0);
  /** Re-entrancy guard — goLive and the resume effect can race into
   *  connectAndPublish; only one pipeline ever runs. */
  const connectingRef = useRef(false);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const retryMedia = useCallback(() => setAttempt((n) => n + 1), []);

  // ── Media plumbing ─────────────────────────────────────────────────

  const attachPreview = useCallback((el: HTMLVideoElement | null) => {
    previewElRef.current = el;
    if (!el) return;
    if (videoTrackRef.current) {
      videoTrackRef.current.attach(el);
    } else if (checkStreamRef.current) {
      el.srcObject = checkStreamRef.current;
    }
  }, []);

  /** Drop the room and every local capture — idempotent. */
  const teardownMedia = useCallback(() => {
    generationRef.current += 1;
    const room = roomRef.current;
    roomRef.current = null;
    videoTrackRef.current = null;
    audioTrackRef.current = null;
    if (room) void room.disconnect().catch(() => {});
    const check = checkStreamRef.current;
    checkStreamRef.current = null;
    check?.getTracks().forEach((t) => t.stop());
    setCameraCheck('idle');
    setMicMuted(false);
    setCamMuted(false);
  }, []);

  /**
   * Mint (or reuse) the host token → connect the LiveKit room →
   * createLocalTracks + publish camera/mic → attach the local preview.
   * Every failure maps onto `media`/`mediaError`; never throws.
   */
  const connectAndPublish = useCallback(async () => {
    if (!sessionId || connectingRef.current || roomRef.current) return;
    connectingRef.current = true;
    const gen = generationRef.current;
    const stale = () => generationRef.current !== gen;
    setMedia('connecting');
    setMediaError(null);

    try {
      let join = tokenRef.current;
      if (!join) {
        try {
          join = await liveService.fetchStreamToken(sessionId, 'host');
        } catch (error) {
          setMedia('failed');
          setMediaError(
            parseApiError(error, 'Could not get a broadcast token').message,
          );
          return;
        }
        tokenRef.current = join;
      }
      if (stale()) return;

      const lk = await import('livekit-client');
      if (stale()) return;

      const room = new lk.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(lk.RoomEvent.Disconnected, () => {
        if (roomRef.current !== room) return;
        roomRef.current = null;
        videoTrackRef.current = null;
        audioTrackRef.current = null;
        setMedia((prev) => (prev === 'idle' ? prev : 'failed'));
        setMediaError('The broadcast connection dropped — retry to reconnect.');
      });

      try {
        await room.connect(join.wsUrl, join.token);
      } catch {
        if (roomRef.current === room) roomRef.current = null;
        void room.disconnect().catch(() => {});
        setMedia('failed');
        setMediaError('Could not connect to the broadcast room.');
        return;
      }
      if (stale()) {
        void room.disconnect().catch(() => {});
        return;
      }

      // getUserMedia — the browser permission prompt lives here. The
      // backstage camera-check stream is released first: two capturers
      // on one device fight on some browsers.
      setMedia('requesting');
      const check = checkStreamRef.current;
      checkStreamRef.current = null;
      check?.getTracks().forEach((t) => t.stop());
      setCameraCheck('idle');

      let tracks: Awaited<ReturnType<typeof lk.createLocalTracks>>;
      try {
        tracks = await lk.createLocalTracks({ audio: true, video: true });
      } catch (error) {
        const name = (error as DOMException)?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setMedia('denied');
          setMediaError(
            'Camera and microphone access was denied — allow both in the browser and retry.',
          );
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setMedia('denied');
          setMediaError('No camera or microphone was found on this device.');
        } else {
          setMedia('failed');
          setMediaError('The camera or microphone could not be started.');
        }
        return;
      }
      if (stale()) {
        tracks.forEach((t) => t.stop());
        return;
      }

      for (const track of tracks) {
        if (track.kind === lk.Track.Kind.Video) {
          videoTrackRef.current = track as LocalVideoTrack;
        } else if (track.kind === lk.Track.Kind.Audio) {
          audioTrackRef.current = track as LocalAudioTrack;
        }
      }

      try {
        for (const track of tracks) {
          await room.localParticipant.publishTrack(track);
        }
      } catch {
        tracks.forEach((t) => t.stop());
        videoTrackRef.current = null;
        audioTrackRef.current = null;
        setMedia('failed');
        setMediaError('Connected, but the camera/mic could not be published.');
        return;
      }
      if (stale()) {
        tracks.forEach((t) => t.stop());
        return;
      }

      if (videoTrackRef.current && previewElRef.current) {
        videoTrackRef.current.attach(previewElRef.current);
      }
      setMedia('published');
    } finally {
      connectingRef.current = false;
    }
  }, [sessionId]);

  // ── Chat mapping ───────────────────────────────────────────────────

  const mapMessage = useCallback(
    (m: liveService.StreamChatMessage): LiveChatMessage => ({
      id: m.id,
      user: m.userName,
      text: m.message,
      kind: m.type === 'message' ? 'chat' : 'system',
      seller: m.isSeller,
      mine: myId != null && m.userId === myId,
      userId: m.userId,
    }),
    [myId],
  );

  const trackChatter = useCallback((m: liveService.StreamChatMessage) => {
    if (m.isSeller || !m.userId) return;
    const map = chatterMapRef.current;
    if (map.has(m.userId)) return;
    map.set(m.userId, m.userName);
    setChatters(
      [...map.entries()].map(([userId, userName]) => ({ userId, userName })),
    );
  }, []);

  const appendMessage = useCallback(
    (m: liveService.StreamChatMessage) => {
      trackChatter(m);
      if (seenIds.current.has(m.id)) return;
      seenIds.current.add(m.id);
      setMessages((prev) => [...prev.slice(-150), mapMessage(m)]);
    },
    [mapMessage, trackChatter],
  );

  const appendSystemLine = useCallback((id: string, text: string) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, { id, user: '', text, kind: 'system' as const }];
    });
  }, []);

  // ── Chat snapshot — the endpoint only exists while the stream is live
  //    (409 pre-live), so history loads once the phase flips and then
  //    reconciles on the same slow poll the viewer side runs. ─────────
  useEffect(() => {
    if (!active || !sessionId || phase !== 'live') return;
    let cancelled = false;

    const load = async () => {
      try {
        const rows = await liveService.fetchStreamChatMessages(sessionId);
        if (cancelled) return;
        seenIds.current = new Set(rows.map((r) => r.id));
        const map = chatterMapRef.current;
        for (const r of rows) {
          if (!r.isSeller && r.userId) map.set(r.userId, r.userName);
        }
        setChatters(
          [...map.entries()].map(([userId, userName]) => ({
            userId,
            userName,
          })),
        );
        setMessages((prev) => [
          ...prev.filter((m) => m.kind === 'system'),
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
  }, [active, sessionId, phase, mapMessage]);

  // ── Muted-viewer baseline — the only roster the backend exposes.
  //    Re-fetched on every moderation SSE event so concurrent host/admin
  //    actions converge. ──────────────────────────────────────────────
  useEffect(() => {
    if (!active || !sessionId || isGuest) return;
    let cancelled = false;
    const load = () =>
      liveService
        .fetchMutedStreamViewers(sessionId)
        .then((rows) => {
          if (!cancelled) setMutedViewers(rows);
        })
        .catch(() => {});
    void load();
    return () => {
      cancelled = true;
    };
  }, [active, sessionId, isGuest, attempt]);

  // ── SSE session channel — same grammar as useLiveRoom: fetch + Bearer,
  //    data: frames, reconnect with backoff, resnapshot after a gap. The
  //    host is authorized for the topic pre-live, so backstage lot writes
  //    stream in too. ─────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !sessionId || isGuest || phase === 'ended') return;

    const topic = `live.session:${sessionId}`;
    let disposed = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connectAttempt = 0;

    const resnapshot = () => {
      if (phaseRef.current === 'live') {
        void liveService
          .fetchStreamChatMessages(sessionId)
          .then((rows) => {
            if (disposed) return;
            seenIds.current = new Set(rows.map((r) => r.id));
            const map = chatterMapRef.current;
            for (const r of rows) {
              if (!r.isSeller && r.userId) map.set(r.userId, r.userName);
            }
            setChatters(
              [...map.entries()].map(([userId, userName]) => ({
                userId,
                userName,
              })),
            );
            setMessages((prev) => [
              ...prev.filter((m) => m.kind === 'system'),
              ...rows.map(mapMessage),
            ]);
          })
          .catch(() => {});
      }
      void liveService
        .fetchMutedStreamViewers(sessionId)
        .then((rows) => {
          if (!disposed) setMutedViewers(rows);
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
          setPhase('ended');
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
        case 'live.viewer.muted':
        case 'live.viewer.unmuted': {
          // Refetch rather than patch — the muted map is the authority
          // and another host/admin may have acted concurrently.
          void liveService
            .fetchMutedStreamViewers(sessionId)
            .then((rows) => {
              if (!disposed) setMutedViewers(rows);
            })
            .catch(() => {});
          return;
        }
        case 'live.viewer.kicked': {
          // A viewer-count event follows when the kicked user was in the
          // live set — nothing else for the host to do.
          return;
        }
        default: {
          // Lot-engine traffic (live.bid.placed, live.current_lot.update,
          // lot.*) — invalidate the board's REST queries rather than
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
            else if (line.startsWith('data:'))
              dataLines.push(line.slice(5).trimStart());
          }
        }
      } catch {
        // Intentional abort or a network drop — reconnect below.
      } finally {
        controller = null;
      }

      if (disposed) return;
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
  }, [active, sessionId, isGuest, phase, myId, qc]);

  // ── Room join — auto-connect when the console opens on an already-live
  //    session (resume), and re-run on explicit retry after a failure. ──
  useEffect(() => {
    if (!active || !sessionId || phase !== 'live') return;
    if (roomRef.current || connectingRef.current) return;
    void connectAndPublish();
  }, [active, sessionId, phase, attempt, connectAndPublish]);

  // Ended (host action or server event) — tear down the media plane.
  useEffect(() => {
    if (phase === 'ended') teardownMedia();
  }, [phase, teardownMedia]);

  // Unmount — leave the room, stop every capture.
  useEffect(
    () => () => {
      teardownMedia();
    },
    [teardownMedia],
  );

  // ── Actions ────────────────────────────────────────────────────────

  /** The real go-live: POST /start flips the session (and fires the
   *  follower/reminder fan-out server-side), then the media pipeline
   *  joins the room and publishes. A media failure degrades honestly —
   *  the show is live for chat/lots regardless. */
  const goLive = useCallback(async () => {
    if (!sessionId || goingLive || phase !== 'backstage') return;
    setGoingLive(true);
    setGoLiveError(null);
    try {
      const started = await liveService.startStreamSession(sessionId);
      setStartedAtMs(
        started.startedAt ? Date.parse(started.startedAt) : Date.now(),
      );
      setPhase('live');
      void qc.invalidateQueries({ queryKey: ['live-sessions'] });
      appendSystemLine(
        `${sessionId}-went-live`,
        'You went live — viewers can chat now',
      );
      await connectAndPublish();
    } catch (error) {
      setGoLiveError(
        parseApiError(error, 'Could not go live — try again.').message,
      );
    } finally {
      setGoingLive(false);
    }
  }, [
    sessionId,
    goingLive,
    phase,
    qc,
    appendSystemLine,
    connectAndPublish,
  ]);

  /** POST /end — deletes the provider room and broadcasts
   *  live.session.ended with the real totals (arrives back over SSE). An
   *  unconfirmed end stays on the live surface with the error so the
   *  host can retry rather than fabricating a clean end (mirrors mobile). */
  const endBroadcast = useCallback(async () => {
    if (!sessionId || ending || phase !== 'live') return;
    setEnding(true);
    setEndError(null);
    try {
      await liveService.endStreamSession(sessionId);
    } catch (error) {
      setEndError(
        parseApiError(
          error,
          'End of stream could not be confirmed — check before going live again.',
        ).message,
      );
      setEnding(false);
      return;
    }
    setPhase('ended');
    void qc.invalidateQueries({ queryKey: ['live-sessions'] });
    setEnding(false);
  }, [sessionId, ending, phase, qc]);

  /** Send on the same chat endpoint viewers use — the server flags host
   *  messages isSeller; the SSE echo dedupes by id. */
  const send =
    active && phase === 'live' && sessionId
      ? (text: string) => {
          void liveService
            .sendStreamChatMessage(sessionId, text)
            .then(appendMessage)
            .catch((error: unknown) => {
              show(
                parseApiError(error, 'Message was not sent').message,
                'error',
              );
            });
        }
      : null;

  // ── Moderation — the real host/admin routes. Callers toast on throw. ─

  const muteViewer = useCallback(
    async (userId: string) => {
      if (!sessionId) return;
      await liveService.setStreamViewerMuted(sessionId, userId, true);
      setMutedViewers((prev) =>
        prev.some((v) => v.userId === userId)
          ? prev
          : [
              ...prev,
              { userId, mutedAt: new Date().toISOString(), mutedBy: myId },
            ],
      );
    },
    [sessionId, myId],
  );

  const unmuteViewer = useCallback(
    async (userId: string) => {
      if (!sessionId) return;
      await liveService.setStreamViewerMuted(sessionId, userId, false);
      setMutedViewers((prev) => prev.filter((v) => v.userId !== userId));
    },
    [sessionId],
  );

  /** Kick ejects now; the response carries the post-kick viewer count. */
  const kickViewer = useCallback(
    async (userId: string) => {
      if (!sessionId) return;
      const count = await liveService.kickStreamViewer(sessionId, userId);
      setViewerCount(count);
    },
    [sessionId],
  );

  // ── Backstage camera check — local getUserMedia only; released before
  //    the publish pipeline acquires the device. ───────────────────────
  const startCameraCheck = useCallback(async () => {
    if (
      cameraCheck === 'on' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraCheck('denied');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      checkStreamRef.current = stream;
      if (previewElRef.current) previewElRef.current.srcObject = stream;
      setCameraCheck('on');
    } catch {
      setCameraCheck('denied');
    }
  }, [cameraCheck]);

  const stopCameraCheck = useCallback(() => {
    const stream = checkStreamRef.current;
    checkStreamRef.current = null;
    stream?.getTracks().forEach((t) => t.stop());
    if (previewElRef.current) previewElRef.current.srcObject = null;
    setCameraCheck('idle');
  }, []);

  // ── Capture toggles — mute keeps the publication; honest track-level
  //    state, not a fake UI flag. ──────────────────────────────────────
  const toggleMic = useCallback(() => {
    const track = audioTrackRef.current;
    if (!track) return;
    const next = !micMuted;
    setMicMuted(next);
    void (next ? track.mute() : track.unmute()).catch(() =>
      setMicMuted(!next),
    );
  }, [micMuted]);

  const toggleCamera = useCallback(() => {
    const track = videoTrackRef.current;
    if (!track) return;
    const next = !camMuted;
    setCamMuted(next);
    void (next ? track.mute() : track.unmute()).catch(() =>
      setCamMuted(!next),
    );
  }, [camMuted]);

  return {
    active,
    phase,
    media,
    mediaError,
    attachPreview,
    goLive,
    goingLive,
    goLiveError,
    endBroadcast,
    ending,
    endError,
    endSummary,
    startedAtMs,
    viewerCount,
    messages,
    chatters,
    send,
    mutedViewers,
    muteViewer,
    unmuteViewer,
    kickViewer,
    micMuted,
    camMuted,
    toggleMic,
    toggleCamera,
    cameraCheck,
    startCameraCheck,
    stopCameraCheck,
    retryMedia,
  };
}

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

import { useCallback, useState } from 'react';
import { DATA_MODE } from '@/lib/api/client';
import { useSession } from '@/lib/session/SessionProvider';
import type { LiveSession } from '@/lib/data/fixtures-media';
import type { LivePlaybackState, LiveRoomEndSummary } from './liveRoomTypes';
import { useLiveKitPlayback } from './useLiveKitPlayback';
import { useLiveRealtimeChannel } from './useLiveRealtimeChannel';

export type { LivePlaybackState, LiveRoomEndSummary };

export function useLiveRoom(session: LiveSession | null) {
  const { user, isGuest } = useSession();

  // Demo-flagged rows (host-authored fixture shows) never reach a real
  // room — same honest-absence guard the lot dock applies.
  const live =
    DATA_MODE === 'live' && session != null && session.isDemo !== true;
  const sessionId = session?.id ?? null;
  const isLiveNow = session?.status === 'live';
  const myId = user?.id ?? null;

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const {
    playback,
    setPlayback,
    attachVideo,
    attachAudio,
  } = useLiveKitPlayback({
    live,
    sessionId,
    isLiveNow,
    isGuest,
    attempt,
    sessionStatus: session?.status,
  });

  const {
    viewerCount,
    messages,
    endSummary,
    send,
  } = useLiveRealtimeChannel({
    live,
    session,
    sessionId,
    isLiveNow,
    isGuest,
    myId,
    attempt,
    playback,
    setPlayback,
  });

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

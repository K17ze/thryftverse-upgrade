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

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as liveService from '@/lib/api/services/live';
import { useSession } from '@/lib/session/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import type { LiveSession } from '@/lib/data/fixtures-media';
import {
  type HostBroadcastPhase,
  type HostChatter,
  type HostMediaState,
} from './broadcast/broadcastTypes';
import { useHostMediaPipeline } from './broadcast/useHostMediaPipeline';
import { useHostChatModeration } from './broadcast/useHostChatModeration';
import { useHostLifecycle } from './broadcast/useHostLifecycle';

export type { HostBroadcastPhase, HostMediaState, HostChatter };

export function useHostBroadcast(
  session: LiveSession | null,
  preMintedToken?: liveService.StreamJoinToken | null,
) {
  const { user, isGuest } = useSession();
  const { show } = useToast();
  const qc = useQueryClient();

  const active =
    DATA_MODE === 'live' && session != null && session.isDemo !== true;
  const sessionId = session?.id ?? null;
  const myId = user?.id ?? null;

  const initialPhase: HostBroadcastPhase =
    session?.status === 'ended'
      ? 'ended'
      : session?.status === 'live'
        ? 'live'
        : 'backstage';

  const {
    media,
    mediaError,
    micMuted,
    camMuted,
    cameraCheck,
    attempt,
    roomRef,
    connectingRef,
    attachPreview,
    connectAndPublish,
    teardownMedia,
    startCameraCheck,
    stopCameraCheck,
    toggleMic,
    toggleCamera,
    retryMedia,
  } = useHostMediaPipeline({ sessionId, preMintedToken });

  const {
    phase,
    setPhase,
    goingLive,
    goLiveError,
    ending,
    endError,
    endSummary,
    setEndSummary,
    startedAtMs,
    goLive,
    endBroadcast,
  } = useHostLifecycle({
    sessionId,
    initialPhase,
    initialStartedAt: session?.startedAt,
    connectAndPublish,
    appendSystemLine: (id, text) => appendSystemLine(id, text),
    qc,
  });

  const {
    viewerCount,
    messages,
    chatters,
    mutedViewers,
    send,
    muteViewer,
    unmuteViewer,
    kickViewer,
    appendSystemLine,
  } = useHostChatModeration({
    active,
    sessionId,
    phase,
    isGuest,
    myId,
    attempt,
    initialViewers: session?.viewers,
    onSessionEnded: (summary) => {
      setPhase('ended');
      setEndSummary(summary);
    },
    show,
    qc,
  });

  // ── Room join — auto-connect when the console opens on an already-live
  //    session (resume), and re-run on explicit retry after a failure. ──
  useEffect(() => {
    if (!active || !sessionId || phase !== 'live') return;
    if (roomRef.current || connectingRef.current) return;
    void connectAndPublish();
  }, [active, sessionId, phase, attempt, connectAndPublish, roomRef, connectingRef]);

  // Ended (host action or server event) — tear down the media plane.
  useEffect(() => {
    if (phase === 'ended') teardownMedia();
  }, [phase, teardownMedia]);

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

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import {
  LIVE_SESSIONS,
  type LiveSession,
} from '@/lib/data/fixtures-media';
import { getHostStream } from '@/components/livehost/hostStreams';
import { useLiveSessions } from '@/components/live/useLiveSessions';
import { useToast } from '@/components/ui/Toast';

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));
export const sessionKey = (id: string) => ['live-session', id] as const;

export function useReplayWorkflow(
  sessionId: string,
  initialSession?: LiveSession,
) {
  const router = useRouter();
  const { show } = useToast();
  const queryClient = useQueryClient();

  // Hydrate the ['live-session', id] entry with the server-resolved row
  // before the query subscribes — first paint skips a render-blocking
  // fetch (same seeding grammar as the PDP). Stamped stale so the mount
  // revalidation still re-reads; a cached row is never clobbered.
  if (
    initialSession &&
    queryClient.getQueryData(sessionKey(sessionId)) == null
  ) {
    queryClient.setQueryData<LiveSession | null>(
      sessionKey(sessionId),
      initialSession,
      { updatedAt: 0 },
    );
  }

  const {
    data: session,
    isLoading,
    isError,
    refetch,
  } = useQuery<LiveSession | null>({
    queryKey: sessionKey(sessionId),
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        // A live row deleted between SSR and revalidation is a not-found,
        // not a load error.
        return liveService.fetchStreamSession(sessionId).catch((error) => {
          if (error instanceof ApiRequestError && error.status === 404) {
            return null;
          }
          throw error;
        });
      }
      await tick();
      // Fixture mode — the hub cache is freshest (host-console mutations
      // write there first), then the host-store map for shows authored
      // this session, then the seeded catalogue.
      const hub = queryClient.getQueryData<LiveSession[]>(['live-sessions']);
      return (
        hub?.find((s) => s.id === sessionId) ??
        getHostStream(sessionId)?.session ??
        LIVE_SESSIONS.find((s) => s.id === sessionId) ??
        null
      );
    },
  });

  // Secondary surface — the hub's other ended shows for continuous
  // watching. A failure here omits the rail instead of erroring the page;
  // the replay itself is the primary content.
  const { data: sessions } = useLiveSessions();

  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  // In-page navigation along the "More replays" rail swaps sessionId
  // without remounting — a stale failure overlay must not survive.
  useEffect(() => {
    setPlaybackFailed(false);
    setPlaybackAttempt(0);
  }, [sessionId]);

  // LivePlayer's replay <video> accepts no error callback — attach a
  // native listener to the stage's media element instead (React's
  // delegated onError doesn't reach media errors on ancestors). The
  // pre-check covers failures that land before the listener attaches.
  useEffect(() => {
    if (playbackFailed) return;
    const el = stageRef.current?.querySelector('video');
    if (!el) return;
    if (el.error) {
      setPlaybackFailed(true);
      return;
    }
    const onError = () => setPlaybackFailed(true);
    el.addEventListener('error', onError);
    return () => el.removeEventListener('error', onError);
  }, [playbackFailed, playbackAttempt, session?.recordingUrl]);

  const share = useCallback(async () => {
    if (!session) return;
    // The deep link itself is the share payload — a member can paste it
    // anywhere and land back on this surface.
    const url = `${window.location.origin}/live/${encodeURIComponent(session.id)}/replay`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: session.title, url });
        return;
      } catch {
        // Dismissed or unsupported — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show('Replay link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  }, [session, show]);

  // A playback failure on a signed recording URL usually means it expired
  // — refetch the row through the same API path for a fresh URL (or the
  // honest processing/gone state when the recording is no longer there).
  const retryPlayback = useCallback(async () => {
    await refetch();
    setPlaybackFailed(false);
    // Remount the player stage — a retry is a fresh watch attempt against
    // the (possibly refreshed) URL, not a resume of the failed source.
    setPlaybackAttempt((n) => n + 1);
  }, [refetch]);

  const moreReplays = (sessions ?? []).filter(
    (s) => s.status === 'ended' && s.id !== session?.id,
  );

  return {
    router,
    session,
    isLoading,
    isError,
    refetch,
    playbackFailed,
    playbackAttempt,
    stageRef,
    share,
    retryPlayback,
    moreReplays,
  };
}

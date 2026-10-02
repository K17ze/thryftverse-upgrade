'use client';

/**
 * /live/[id]/replay — dedicated VOD replay surface, the web counterpart
 * of mobile's LiveStreamReplayScreen. The recording is the dominant
 * object (16:9 stage on black, LivePlayer's existing replay path);
 * session metadata sits on the flat canvas below — hairlines and type
 * hierarchy, no cards — and a "More replays" rail chains to the hub's
 * other ended shows.
 *
 * Truthful states, the same matrix mobile renders: a show still live
 * hands off to the watch surface; an upcoming show says it hasn't aired;
 * an ended session with recordingEnabled but no recordingUrl is still
 * processing (Check again refetches the row — the URL is server truth);
 * one never recorded says so; a playback failure refetches a fresh row
 * rather than remounting an expired source forever.
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { liveSellerOf } from '@/components/live/useLiveSessions';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/utils/format';
import { useReplayWorkflow } from './useReplayWorkflow';
import {
  ReplaySkeleton,
  ReplayErrorState,
  ReplayLiveNowState,
  ReplayUpcomingState,
  ReplayNotRecordedState,
  ReplayPreparingState,
} from './ReplayEmptyStates';
import { ReplayStage } from './ReplayStage';
import { ReplayMoreRail } from './ReplayMoreRail';

export { ReplaySkeleton };

export function ReplayClient({
  sessionId,
  initialSession,
}: {
  sessionId: string;
  initialSession?: LiveSession;
}) {
  const {
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
  } = useReplayWorkflow(sessionId, initialSession);

  if (isLoading) return <ReplaySkeleton />;

  if (isError) {
    return <ReplayErrorState onRetry={() => void refetch()} />;
  }

  // Resolved-empty is a definitive miss — the not-found boundary owns it
  // (the server page 404s the misses it can see; client-side misses —
  // session-dissolved demo shows, live rows deleted mid-session — land here).
  if (!session) notFound();

  // Still live — hand off to the watch surface rather than render a dead
  // player; the replay lands here once the show ends.
  if (session.status === 'live') {
    return <ReplayLiveNowState sessionId={session.id} router={router} />;
  }

  // Scheduled but not aired — there is nothing to replay yet.
  if (session.status === 'upcoming') {
    return <ReplayUpcomingState session={session} router={router} />;
  }

  // Ended, never recorded — honest absence, not a dead player.
  if (!session.recordingEnabled) {
    return <ReplayNotRecordedState router={router} />;
  }

  // Ended and recorded, but the egress hasn't persisted a URL yet —
  // processing is transient, so Check again re-reads the session row.
  if (!session.recordingUrl) {
    return <ReplayPreparingState onRefetch={() => void refetch()} />;
  }

  const seller = liveSellerOf(session);
  const metaLine = [
    session.endedAt ? `Ended ${timeAgo(session.endedAt)}` : null,
    session.durationMinutes != null ? `${session.durationMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto w-full max-w-[1152px] px-4 pt-5 sm:px-6 md:pt-7">
      {/* Back row — a shared deep link has no stack under it, so the exit
          is the hub, not history. */}
      <Link
        href="/live"
        className="pressable mb-4 inline-flex h-9 items-center gap-1 rounded-md pr-2 text-caption font-medium text-text-secondary hover:text-text-primary"
        aria-label="Back to live shopping"
      >
        <Icon name="back" size={16} />
        Live
      </Link>

      {/* The stage — LivePlayer's existing replay path renders the
          persisted recording in a plain video element. A media error
          swaps in the honest failure state (the URL may simply have
          expired — retry refetches the row). */}
      <ReplayStage
        stageRef={stageRef}
        session={session}
        playbackFailed={playbackFailed}
        playbackAttempt={playbackAttempt}
        onRetryPlayback={() => void retryPlayback()}
      />

      {/* Session metadata — flat canvas, type hierarchy only. */}
      <div className="mt-5 flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-item-title font-semibold text-text-primary sm:text-screen-title">
          {session.title}
        </h1>
        <Button
          variant="secondary"
          size="sm"
          icon="share"
          onClick={() => void share()}
          className="shrink-0"
        >
          Share
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {seller?.username ? (
          <span className="inline-flex min-w-0 items-center gap-2">
            <Avatar src={seller.avatar} name={seller.username} size={24} />
            <span className="clamp-1 text-body-emphasis text-text-primary">
              @{seller.username}
            </span>
            {seller.isVerified ? (
              <Icon
                name="verified"
                size={14}
                className="shrink-0 text-commerce-trust"
                filled
              />
            ) : null}
          </span>
        ) : null}
        {metaLine ? (
          <span className="tnum text-meta text-text-muted">{metaLine}</span>
        ) : null}
      </div>

      {/* More replays — the hub's other ended shows; omitted entirely when
          none loaded rather than rendering an empty rail. */}
      <ReplayMoreRail moreReplays={moreReplays} />
    </div>
  );
}

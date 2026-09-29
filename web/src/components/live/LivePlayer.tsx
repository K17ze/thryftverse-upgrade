'use client';

/**
 * LivePlayer — the overlay's media stage for real backend sessions.
 * The host's LiveKit video track renders in a plain <video>; an ended
 * show with a recording_url gets a standard replay element. Everything
 * else is an honest state line over black — a cover image is never
 * presented as if it were the live feed.
 */

import Link from 'next/link';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { Icon } from '@/components/ui/Icon';
import { formatPrice } from '@/lib/utils/format';
import type { LivePlaybackState, LiveRoomEndSummary } from './useLiveRoom';
import { formatScheduled } from './UpcomingRail';

interface LivePlayerProps {
  session: LiveSession;
  state: LivePlaybackState;
  endSummary: LiveRoomEndSummary | null;
  attachVideo: (el: HTMLVideoElement | null) => void;
  attachAudio: (el: HTMLAudioElement | null) => void;
  onRetry: () => void;
}

function StageNote({
  icon,
  title,
  body,
  children,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-scrim-text-secondary">
        <Icon name={icon} size={24} />
      </span>
      <p className="text-body-emphasis font-semibold text-scrim-text-primary">{title}</p>
      {body ? (
        <p className="max-w-xs text-caption text-scrim-text-secondary">{body}</p>
      ) : null}
      {children}
    </div>
  );
}

export function LivePlayer({
  session,
  state,
  endSummary,
  attachVideo,
  attachAudio,
  onRetry,
}: LivePlayerProps) {
  // Replay — ended show with a persisted recording gets a plain video
  // element; without one the ended state is honest, not a frozen cover.
  if (state === 'ended' || session.status === 'ended') {
    if (session.recordingUrl) {
      return (
        <video
          src={session.recordingUrl}
          controls
          playsInline
          preload="metadata"
          poster={session.coverUri || undefined}
          className="absolute inset-0 h-full w-full bg-black object-contain"
        />
      );
    }
    return (
      <StageNote icon="videocam" title="This show has ended">
        {endSummary && (endSummary.lotsSold > 0 || endSummary.totalViewers > 0) ? (
          <p className="tnum text-meta text-scrim-text-secondary">
            {[
              endSummary.totalViewers > 0
                ? `${endSummary.totalViewers} ${
                    endSummary.totalViewers === 1 ? 'viewer' : 'viewers'
                  }`
                : null,
              endSummary.lotsSold > 0
                ? `${endSummary.lotsSold} ${
                    endSummary.lotsSold === 1 ? 'lot' : 'lots'
                  } sold`
                : null,
              endSummary.totalSales > 0
                ? formatPrice(endSummary.totalSales)
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        {session.recordingEnabled ? (
          <p className="text-meta text-scrim-text-tertiary">
            The replay will appear here once it&apos;s ready.
          </p>
        ) : null}
      </StageNote>
    );
  }

  if (session.status === 'upcoming') {
    return (
      <StageNote
        icon="clock"
        title="This show hasn’t started yet"
        body={
          session.scheduledAt
            ? `Goes live ${formatScheduled(session.scheduledAt)}.`
            : undefined
        }
      />
    );
  }

  return (
    <>
      {/* Host media — mounted for the whole join lifecycle so track
          attachment never races a late mount; hidden until a video
          track is actually on the wire. */}
      <video
        ref={attachVideo}
        autoPlay
        playsInline
        aria-label={`${session.title} — live video`}
        className={`absolute inset-0 h-full w-full bg-black object-cover ${
          state === 'watching' ? '' : 'invisible'
        }`}
      />
      <audio ref={attachAudio} autoPlay className="hidden" aria-hidden />

      {state === 'auth' ? (
        <StageNote
          icon="lock"
          title="Sign in to watch"
          body="Live video is for signed-in viewers — chat and the lots are still live below."
        >
          <Link
            href="/auth/login"
            className="pressable mt-1 h-10 rounded-full bg-scrim-text-primary px-5 text-caption font-semibold leading-10 text-black"
          >
            Sign in
          </Link>
        </StageNote>
      ) : null}

      {state === 'connecting' ? (
        <StageNote icon="videocam" title="Connecting to the stream…" />
      ) : null}

      {state === 'waiting' ? (
        <StageNote
          icon="videocam"
          title="Waiting for the host’s video"
          body="You’re in the room — video starts as soon as the host’s camera is on."
        />
      ) : null}

      {state === 'error' ? (
        <StageNote
          icon="warning"
          title="Live video couldn’t connect"
          body="Chat and bidding still work — the stream itself didn’t answer."
        >
          <button
            type="button"
            onClick={onRetry}
            className="pressable mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-scrim-text-primary px-5 text-caption font-semibold text-black"
          >
            <Icon name="refresh" size={14} />
            Retry
          </button>
        </StageNote>
      ) : null}

      {state === 'removed' ? (
        <StageNote
          icon="ban"
          title="You were removed from this stream"
          body="Chat and video are off for you in this show."
        />
      ) : null}
    </>
  );
}

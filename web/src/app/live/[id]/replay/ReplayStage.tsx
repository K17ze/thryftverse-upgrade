'use client';

import { type RefObject } from 'react';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { LivePlayer } from '@/components/live/LivePlayer';
import { Icon } from '@/components/ui/Icon';

/** LivePlayer's live-track attach points — a replay never mounts them,
 *  so the callbacks are inert by contract, not stubbed-over bugs. */
const attachNothing = () => {};

interface ReplayStageProps {
  stageRef: RefObject<HTMLDivElement | null>;
  session: LiveSession;
  playbackFailed: boolean;
  playbackAttempt: number;
  onRetryPlayback: () => void;
}

export function ReplayStage({
  stageRef,
  session,
  playbackFailed,
  playbackAttempt,
  onRetryPlayback,
}: ReplayStageProps) {
  return (
    <div
      ref={stageRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
    >
      {playbackFailed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Icon name="warning" size={28} className="text-scrim-text-secondary" />
          <p className="text-body-emphasis font-semibold text-scrim-text-primary">
            Couldn’t play this replay
          </p>
          <p className="max-w-xs text-caption text-scrim-text-secondary">
            The recording link may have expired — fetching it again usually
            fixes it.
          </p>
          <button
            type="button"
            onClick={onRetryPlayback}
            className="pressable mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-scrim-text-primary px-5 text-caption font-semibold text-black"
          >
            <Icon name="refresh" size={14} />
            Retry
          </button>
        </div>
      ) : (
        <LivePlayer
          key={playbackAttempt}
          session={session}
          state="ended"
          endSummary={null}
          attachVideo={attachNothing}
          attachAudio={attachNothing}
          onRetry={onRetryPlayback}
        />
      )}
    </div>
  );
}

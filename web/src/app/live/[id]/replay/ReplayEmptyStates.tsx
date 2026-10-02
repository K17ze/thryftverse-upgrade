'use client';

import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { LiveSession } from '@/lib/data/fixtures-media';
import { formatScheduled } from '@/components/live/UpcomingRail';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

/** Loading skeleton — mirrors the composed geometry (16:9 stage, title,
 *  seller row, rail) so the populated state lands without a shift. */
export function ReplaySkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[1152px] px-4 pt-5 sm:px-6 md:pt-7"
      aria-busy
      aria-label="Loading replay"
    >
      <Skeleton className="aspect-video w-full rounded-xl" />
      <Skeleton className="mt-5 h-6 w-3/5" />
      <div className="mt-3.5 flex items-center gap-2.5">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3.5 w-32" />
      </div>
      <Skeleton className="mt-10 h-5 w-28" />
      <div className="mt-3 flex gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-36 shrink-0 sm:w-44">
            <Skeleton className="aspect-[4/5] w-full rounded-lg" />
            <Skeleton className="mt-2.5 h-3.5 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReplayErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
      <EmptyState
        icon="alert"
        title="Couldn’t load this replay"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </div>
  );
}

export function ReplayLiveNowState({
  sessionId,
  router,
}: {
  sessionId: string;
  router: AppRouterInstance;
}) {
  return (
    <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
      <EmptyState
        icon="videocam"
        title="This show is live right now"
        subtitle="The replay lands here once the show ends."
        actionLabel="Watch live"
        onAction={() =>
          router.push(`/live?watch=${encodeURIComponent(sessionId)}`)
        }
      />
    </div>
  );
}

export function ReplayUpcomingState({
  session,
  router,
}: {
  session: LiveSession;
  router: AppRouterInstance;
}) {
  return (
    <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
      <EmptyState
        icon="clock"
        title="This show hasn’t aired yet"
        subtitle={
          session.scheduledAt
            ? `Goes live ${formatScheduled(session.scheduledAt)}.`
            : 'It hasn’t started — there’s no replay yet.'
        }
        actionLabel="Browse live"
        onAction={() => router.push('/live')}
      />
    </div>
  );
}

export function ReplayNotRecordedState({ router }: { router: AppRouterInstance }) {
  return (
    <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
      <EmptyState
        icon="eyeOff"
        title="This show wasn’t recorded"
        subtitle="The host didn’t record this show — there’s no replay to watch."
        actionLabel="Browse replays"
        onAction={() => router.push('/live')}
      />
    </div>
  );
}

export function ReplayPreparingState({ onRefetch }: { onRefetch: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[1152px] px-4 sm:px-6">
      <EmptyState
        icon="clock"
        title="Replay is being prepared"
        subtitle="The recording lands here shortly after the show ends — check back in a few minutes."
        actionLabel="Check again"
        onAction={onRefetch}
      />
    </div>
  );
}

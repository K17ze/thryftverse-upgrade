import React from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { BackBar } from '@/components/profile/BackBar';
import type { User } from '@/lib/contracts/domain';
import type { PosterArchiveStory } from '@/lib/data/fixtures-posters';

export function PosterActivityGates({
  isLoading,
  isLive,
  sessionLoading,
  isError,
  refetch,
  isGuest,
  story,
  forbidden,
  user,
  onNavigateAuth,
}: {
  isLoading: boolean;
  isLive: boolean;
  sessionLoading: boolean;
  isError: boolean;
  refetch: () => void;
  isGuest: boolean;
  story: PosterArchiveStory | null;
  forbidden: boolean;
  user: User | null;
  onNavigateAuth: () => void;
}) {
  if (isLoading || (isLive && sessionLoading)) {
    return (
      <div
        className="mx-auto max-w-[720px] pb-16 lg:max-w-[1200px]"
        aria-busy
        aria-label="Loading story activity"
      >
        <BackBar />
        <div className="px-4 pt-2 sm:px-6 lg:px-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <div className="mt-5 grid grid-cols-4 gap-2 px-4 sm:px-6 lg:max-w-[400px] lg:grid-cols-2 lg:px-0">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <div className="mt-8 space-y-3 px-4 sm:px-6 lg:px-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-[38px] w-[38px] rounded-full" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[720px]">
        <BackBar />
        <EmptyState
          icon="warning"
          title="Could not load story activity"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={refetch}
        />
      </div>
    );
  }

  if (isLive && isGuest) {
    return (
      <div className="mx-auto max-w-[720px]">
        <BackBar />
        <EmptyState
          icon="lock"
          title="Sign in to view story insights"
          subtitle="Story activity is only visible on stories you published."
          actionLabel="Sign in"
          onAction={onNavigateAuth}
        />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="mx-auto max-w-[720px]">
        <BackBar />
        <EmptyState
          icon="analytics"
          title="No activity for this story"
          subtitle="Insights are recorded for stories in your archive."
          actionLabel="Back to archive"
          onAction={() => window.history.back()}
        />
      </div>
    );
  }

  if (forbidden || story.creatorId !== (user?.id ?? 'me')) {
    return (
      <div className="mx-auto max-w-[720px]">
        <BackBar />
        <EmptyState
          icon="lock"
          title="Insights are owner-only"
          subtitle="Story activity is only visible on stories you published."
          actionLabel="Back"
          onAction={() => window.history.back()}
        />
      </div>
    );
  }

  return null;
}

'use client';

/**
 * MoodboardStatusStates — dedicated state presentations for Moodboard detail:
 * skeleton loader, network failure error state, 404 not found, and private board wall.
 */

import { useRouter } from 'next/navigation';
import { BackBar } from '@/components/profile/BackBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export function MoodboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <BackBar />
      <div className="mx-4 mt-1 sm:mx-6" aria-busy>
        <Skeleton className="h-60 w-full rounded-xl sm:h-80" />
        <div className="mt-4 space-y-2 px-1">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

export function MoodboardErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-[1200px]">
      <BackBar />
      <EmptyState
        icon="warning"
        title="Couldn't load this board"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </div>
  );
}

export function MoodboardNotFoundState() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[1200px]">
      <BackBar />
      <EmptyState
        icon="layers"
        title="Board not found"
        subtitle="This moodboard doesn't exist or may have been removed."
        actionLabel="Back to profile"
        onAction={() => router.push('/profile')}
      />
    </div>
  );
}

export function MoodboardPrivateWallState() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[1200px]">
      <BackBar />
      <EmptyState
        icon="lock"
        title="This board is private"
        subtitle="Only the owner can see what's saved inside."
        actionLabel="Back to profile"
        onAction={() => router.push('/profile')}
      />
    </div>
  );
}

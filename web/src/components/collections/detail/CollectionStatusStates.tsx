'use client';

/**
 * CollectionStatusStates — dedicated state presentations for Collection detail:
 * skeleton loader, closet fetch error, live collection fetch error, and private board wall.
 */

import { useRouter } from 'next/navigation';
import { BackBar } from '@/components/profile/BackBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, MasonrySkeleton } from '@/components/ui/Skeleton';

export function CollectionSkeleton({ columns }: { columns: number }) {
  return (
    <div className="mx-auto max-w-[1440px]">
      <BackBar />
      <div className="space-y-2 px-4 pb-4 pt-2 sm:px-6" aria-busy>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <MasonrySkeleton columns={columns} />
    </div>
  );
}

export function CollectionClosetErrorState({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1440px]">
      <BackBar />
      <EmptyState
        icon="warning"
        title="Couldn't load this closet"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </div>
  );
}

export function CollectionLiveErrorState({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1440px]">
      <BackBar />
      <EmptyState
        icon="warning"
        title="Couldn't load this collection"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </div>
  );
}

export function CollectionPrivateWallState() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-[1440px]">
      <BackBar />
      <EmptyState
        icon="lock"
        title="This collection is private"
        subtitle="Only the owner can see what's saved inside."
        actionLabel="Back to saved"
        onAction={() => router.push('/saved')}
      />
    </div>
  );
}

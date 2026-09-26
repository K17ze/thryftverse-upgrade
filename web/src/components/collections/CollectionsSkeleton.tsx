/**
 * CollectionsSkeleton — loading frame for the hub. Mirrors the square
 * collage grid rhythm so there is no loading→final geometry shift.
 */

import { Skeleton } from '@/components/ui/Skeleton';
import { CuratedRailSkeleton } from './CuratedRail';

export function CollectionsGridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4"
      aria-busy
      aria-label="Loading your collections"
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="mt-2 h-4 w-3/5" />
          <Skeleton className="mt-1.5 h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

export function CollectionsPageSkeleton() {
  return (
    <div aria-busy aria-label="Loading collections">
      <div className="flex items-center justify-between px-4 pt-5 sm:px-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="mt-6 px-4 sm:px-6">
        <Skeleton className="h-5 w-36" />
      </div>
      <div className="mt-4">
        <CollectionsGridSkeleton />
      </div>
      <CuratedRailSkeleton />
    </div>
  );
}

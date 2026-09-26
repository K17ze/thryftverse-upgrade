/**
 * PulseFeedSkeleton — mirrors the PulseCard silhouette so there's no
 * layout shift on load: full-bleed media block, creator row, action
 * rail and caption/chip placeholders in the same geometry.
 */

import { Skeleton } from '@/components/ui/Skeleton';

export function PulseFeedSkeleton() {
  return (
    <div
      className="relative h-[calc(100dvh-4rem-76px)] bg-black md:h-[calc(100dvh-4rem)]"
      aria-busy
      aria-label="Loading Pulse feed"
    >
      <div className="mx-auto h-full max-w-[430px] md:py-3">
        <div className="relative h-full w-full overflow-hidden bg-surface-alt md:rounded-2xl">
          <Skeleton className="absolute inset-0 rounded-none" />

          {/* Creator row */}
          <div className="absolute inset-x-0 top-0 flex items-center gap-2.5 px-4 pt-4">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="mt-1.5 h-3 w-14" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>

          {/* Action rail */}
          <div className="absolute bottom-6 right-1.5 flex flex-col items-center gap-2 px-1.5">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>

          {/* Caption + chips */}
          <div className="absolute inset-x-0 bottom-0 pb-5 pl-4 pr-16">
            <Skeleton className="h-4 w-3/4" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-9 w-36 rounded-full" />
              <Skeleton className="h-9 w-28 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

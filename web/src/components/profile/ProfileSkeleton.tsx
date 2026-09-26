import { Skeleton } from '@/components/ui/Skeleton';

/** Hero skeleton — avatar ring + identity lines, mirrors ProfileHero geometry. */
export function ProfileHeroSkeleton() {
  return (
    <div className="px-4 pt-6 sm:px-6" aria-busy aria-label="Loading profile">
      <div className="flex items-start gap-4 sm:gap-6">
        <Skeleton className="h-[88px] w-[88px] shrink-0 rounded-full" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-4 w-full max-w-xs" />
          <div className="flex gap-2 pt-1.5">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-24 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}

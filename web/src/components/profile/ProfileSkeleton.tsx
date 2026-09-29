import { Skeleton } from '@/components/ui/Skeleton';

/** Hero skeleton — cover block + seam avatar + identity lines, mirrors
 *  ProfileHero geometry (avatar alone bridges the seam on desktop). */
export function ProfileHeroSkeleton({ cover = true }: { cover?: boolean }) {
  return (
    <div aria-busy aria-label="Loading profile">
      {cover ? (
        <Skeleton className="h-36 w-full rounded-none sm:h-48 lg:mx-6 lg:h-56 lg:w-auto lg:rounded-xl xl:h-64" />
      ) : null}
      <div className={`px-4 sm:px-6 ${cover ? '' : 'pt-6 lg:pt-8'}`}>
        <div
          className={`flex items-start gap-4 sm:gap-6 lg:gap-10 ${cover ? '-mt-12 lg:mt-0' : ''}`}
        >
          <Skeleton
            className={`h-24 w-24 shrink-0 rounded-full ring-4 ring-background lg:h-[150px] lg:w-[150px] ${
              cover ? 'lg:-mt-[75px]' : ''
            }`}
          />
          <div className={`flex-1 space-y-2.5 pt-1 ${cover ? 'lg:pt-5' : ''}`}>
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
    </div>
  );
}

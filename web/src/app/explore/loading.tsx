import { MasonrySkeleton, Skeleton } from '@/components/ui/Skeleton';

/** Streaming skeleton for the explore segment — the search header line
 *  over the feed's masonry rhythm. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="px-4 pb-4 pt-5 sm:px-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="mt-3 h-11 w-full max-w-2xl rounded-full" />
      </div>
      {/* MasonrySkeleton pads px-1.5 internally — top up to the page's
          16/24px content edge so the shimmer lands where tiles will. */}
      <div className="px-2.5 sm:px-[18px]">
        <MasonrySkeleton columns={4} />
      </div>
    </div>
  );
}

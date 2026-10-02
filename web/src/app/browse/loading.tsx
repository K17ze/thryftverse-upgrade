import { MasonrySkeleton } from '@/components/ui/Skeleton';

/** Streaming skeleton for the browse segment — the same masonry rhythm
 *  the page's own Suspense fallback paints. */
export default function Loading() {
  return <MasonrySkeleton columns={4} />;
}

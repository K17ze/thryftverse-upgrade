import { CollectionSkeleton } from '@/components/collections/detail/CollectionStatusStates';

/** Streaming skeleton for the collection segment — the detail view's own
 *  loading frame (header lines over the masonry). */
export default function Loading() {
  return <CollectionSkeleton columns={4} />;
}

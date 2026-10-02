import { MoodboardSkeleton } from '@/components/moodboard/detail/MoodboardStatusStates';

/** Streaming skeleton for the moodboard segment — the detail view's own
 *  loading frame (cover hero + caption lines). */
export default function Loading() {
  return <MoodboardSkeleton />;
}

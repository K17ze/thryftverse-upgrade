import { ClosetGridSkeleton } from '@/components/profile/ClosetGrid';
import { ProfileHeroSkeleton } from '@/components/profile/ProfileSkeleton';

/** Streaming skeleton for the profile segment — same composition as the
 *  /u/[username] boundary: hero skeleton, hairline seam, closet grid. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <ProfileHeroSkeleton />
      <div className="mt-5 border-b border-border-subtle" />
      <div className="py-4">
        <ClosetGridSkeleton />
      </div>
    </div>
  );
}

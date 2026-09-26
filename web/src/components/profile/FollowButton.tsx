'use client';

/**
 * FollowButton — one persisted follow toggle for every surface. Guests
 * get the soft signup wall; hydration gates the label so SSR and the
 * first client render agree before the local store lands.
 */

import { Button } from '@/components/ui/Button';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useFollows } from '@/lib/store/follows';
import { useHydrated } from '@/lib/store/useStore';

export function FollowButton({
  userId,
  size = 'sm',
  className,
}: {
  userId: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const hydrated = useHydrated();
  const following = useFollows((s) => s.followingIds.includes(userId));
  const toggleFollow = useFollows((s) => s.toggleFollow);
  const { requireAuth, wall } = useSignupWall();

  // Pre-hydration both sides render the unfollowed state — the persisted
  // store lands on hydrate and the button settles.
  const effective = hydrated && following;

  return (
    <>
      <Button
        variant={effective ? 'secondary' : 'primary'}
        size={size}
        icon={effective ? 'check' : 'follow'}
        className={className}
        aria-pressed={effective}
        onClick={() => {
          if (requireAuth('follow_seller')) toggleFollow(userId);
        }}
      >
        {effective ? 'Following' : 'Follow'}
      </Button>
      {wall}
    </>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import type { User } from '@/lib/contracts/domain';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { FollowButton } from '../FollowButton';
import { ProfileOptionsMenu } from '../ProfileOptionsMenu';

export interface ProfileViewerState {
  isMuted?: boolean;
  isRestricted?: boolean;
  isBlocked?: boolean;
  /** Server-side DM permission (blocks, messaging settings, privacy) —
   *  false disables the Message CTA rather than failing on send. */
  canMessage?: boolean;
}

interface ProfileHeroActionsProps {
  user: User;
  variant: 'self' | 'public';
  viewer?: ProfileViewerState;
  isMessagingPending?: boolean;
  onMessageUser: () => void;
  onShareProfile: () => void;
}

export function ProfileHeroActions({
  user,
  variant,
  viewer,
  isMessagingPending = false,
  onMessageUser,
  onShareProfile,
}: ProfileHeroActionsProps) {
  const router = useRouter();

  return (
    <div className="mt-4 flex items-center gap-1">
      {variant === 'self' ? (
        <>
          <Button
            variant="outline"
            size="sm"
            icon="edit"
            className="mr-1"
            onClick={() => router.push('/profile/edit')}
          >
            Edit
          </Button>
          <Button variant="secondary" size="sm" icon="share" onClick={onShareProfile}>
            Share shop
          </Button>
          <IconButton
            name="store"
            aria-label="Manage listings"
            onClick={() => router.push('/seller-hub/listings')}
          />
          <IconButton
            name="layers"
            aria-label="Collections"
            onClick={() => router.push('/collections')}
          />
          <IconButton
            name="settings"
            aria-label="Settings"
            onClick={() => router.push('/settings')}
          />
        </>
      ) : (
        <>
          {/* Message is the conversion action (the filled control);
              Follow is the quiet stateful affordance — mobile hero
              grammar, not the IG pill row. `canMessage` is the
              server's DM permission — false hides the CTA rather
              than dead-ending on send (blocked/private accounts). */}
          {viewer?.canMessage !== false ? (
            <Button
              variant="primary"
              size="sm"
              icon="chat"
              className="mr-1"
              disabled={isMessagingPending}
              onClick={onMessageUser}
            >
              Message
            </Button>
          ) : null}
          <FollowButton
            userId={user.id}
            size="sm"
            idleVariant="secondary"
            className="mr-1 min-w-[104px]"
          />
          <IconButton name="share" aria-label="Share profile" onClick={onShareProfile} />
          <ProfileOptionsMenu user={user} viewer={viewer} />
        </>
      )}
    </div>
  );
}

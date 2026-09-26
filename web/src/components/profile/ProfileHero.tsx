'use client';

/**
 * ProfileHero — shared identity block for own and public profiles.
 * Flat canvas, 88px avatar, name + verified + trust badges, bio, location,
 * flat-typography stats strip, and the action row per variant.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { ReportLauncher } from '@/components/report';
import { formatCount } from '@/lib/utils/format';
import { FollowButton } from './FollowButton';
import { RatingStars } from './RatingStars';
import { memberSinceFor, verificationTierFor, VERIFICATION_BADGE } from './profileViewModel';

interface ProfileHeroProps {
  user: User;
  /** Live listing count wins over the fixture's cached listingCount. */
  listingCount?: number;
  /** Active (for-sale) count — when provided the lead stat reads "for sale"
   *  instead of the generic "items". */
  forSaleCount?: number;
  /** Sold count — rendered as its own stat when provided (0 included). */
  soldCount?: number;
  variant: 'self' | 'public';
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="tnum text-body-emphasis font-bold text-text-primary">
        {formatCount(value)}
      </span>
      <span className="text-body text-text-muted">{label}</span>
    </span>
  );
}

export function ProfileHero({ user, listingCount, forSaleCount, soldCount, variant }: ProfileHeroProps) {
  const router = useRouter();
  const { show } = useToast();
  const memberSince = memberSinceFor(user.id);
  const verificationTier = verificationTierFor(user);

  const shareProfile = async () => {
    const url = `${window.location.origin}/u/${user.username}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `@${user.username} on ThryftVerse`, url });
        return;
      } catch {
        // Dismissed or unsupported — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show('Profile link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  return (
    <section aria-label={`@${user.username} profile`}>
      {user.coverPhoto ? (
        <div className="relative h-36 sm:h-48">
          <AppImage
            src={user.coverPhoto}
            alt=""
            fill
            sizes="100vw"
            className="h-full w-full"
            priority
          />
        </div>
      ) : null}

      <div className="px-4 sm:px-6">
        <div
          className={`flex items-start gap-4 sm:gap-6 ${
            user.coverPhoto ? '-mt-11' : 'pt-6'
          }`}
        >
          <Avatar
            src={user.avatar}
            name={user.username}
            size={88}
            className={user.coverPhoto ? 'ring-4 ring-background' : 'ring-1 ring-border'}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <h1 className="text-item-title font-bold text-text-primary sm:text-screen-title">
                {user.username}
              </h1>
              {user.isVerified ? (
                <Icon
                  name="verified"
                  filled
                  size={18}
                  className="text-commerce-trust"
                  aria-label="Verified member"
                />
              ) : null}
              {verificationTier ? (
                <Badge
                  variant={VERIFICATION_BADGE[verificationTier].variant}
                  icon={VERIFICATION_BADGE[verificationTier].icon}
                >
                  {VERIFICATION_BADGE[verificationTier].label}
                </Badge>
              ) : null}
              {user.badges.map((b) => (
                <Badge
                  key={b}
                  variant={b === 'Top Seller' ? 'trust' : 'neutral'}
                  icon={b === 'Top Seller' ? 'shieldCheck' : undefined}
                >
                  {b}
                </Badge>
              ))}
            </div>

            {user.bio ? (
              <p className="mt-1.5 max-w-xl text-body text-text-primary">{user.bio}</p>
            ) : null}

            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-meta text-text-muted">
              <Icon name="location" size={13} />
              {user.location}
              {user.lastSeen ? (
                <>
                  <span aria-hidden>·</span>
                  Active {user.lastSeen}
                </>
              ) : null}
              {memberSince ? (
                <>
                  <span aria-hidden>·</span>
                  Joined {memberSince}
                </>
              ) : null}
            </p>

            {/* Stats strip — flat typography, not stat cards */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <Stat
                value={forSaleCount ?? listingCount ?? user.listingCount}
                label={forSaleCount != null ? 'for sale' : 'items'}
              />
              {typeof soldCount === 'number' ? <Stat value={soldCount} label="sold" /> : null}
              <Link
                href={`/u/${user.username}/followers`}
                className="rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              >
                <Stat value={user.followers} label="followers" />
              </Link>
              <Link
                href={`/u/${user.username}/following`}
                className="rounded-sm hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              >
                <Stat value={user.following} label="following" />
              </Link>
              <span className="flex items-center gap-1.5">
                <RatingStars rating={user.rating} size={13} />
                <span className="tnum text-body font-semibold text-text-primary">
                  {user.rating.toFixed(1)}
                </span>
                <span className="text-meta text-text-muted">
                  ({formatCount(user.reviewCount)})
                </span>
              </span>
            </div>

            {/* Actions — one grammar: primary intent + quiet affordances */}
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
                  <Button variant="secondary" size="sm" icon="share" onClick={shareProfile}>
                    Share shop
                  </Button>
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
                  <FollowButton userId={user.id} size="sm" className="mr-1 min-w-[104px]" />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="chat"
                    onClick={() => router.push('/inbox')}
                  >
                    Message
                  </Button>
                  <IconButton name="share" aria-label="Share profile" onClick={shareProfile} />
                  <ReportLauncher
                    target={{ type: 'user', id: user.id, label: `@${user.username}` }}
                    menuTitle="Profile options"
                    menuLabel={`Report @${user.username}`}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

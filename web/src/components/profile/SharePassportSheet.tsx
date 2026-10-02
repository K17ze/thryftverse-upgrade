'use client';

/**
 * SharePassportSheet — the branded shareable "passport" card for a member
 * profile (parity with mobile SharePassportModal). The card is the brand
 * asset: avatar + identity, the highest verification tier the member
 * actually holds, honest trust stats (rating only once reviews exist,
 * sold only when a real count lands), member-since and bio, closed by the
 * ThryftVerse wordmark + canonical URL. Actions use the shared share
 * grammar — device sheet where supported, clipboard otherwise — plus an
 * explicit copy-link with an inline "Copied" state.
 */

import { useEffect, useRef, useState } from 'react';
import type { User } from '@/lib/contracts/domain';
import { formatCount } from '@/lib/utils/format';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { RatingStars } from './RatingStars';
import {
  formatMemberSince,
  memberSinceFor,
  verificationTierFor,
  VERIFICATION_BADGE,
} from './profileViewModel';
import { useShare } from './useShare';

interface SharePassportSheetProps {
  open: boolean;
  onClose: () => void;
  user: User;
  /** Sold count — rendered only when a real number lands. The public
   *  profile passes its resolved sold total; surfaces that don't carry
   *  one drop the stat rather than fabricate it. */
  soldCount?: number;
}

export function SharePassportSheet({ open, onClose, user, soldCount }: SharePassportSheetProps) {
  const { show } = useToast();
  const share = useShare();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const displayName = user.displayName?.trim() || null;
  const profilePath = `/u/${user.username}`;
  const memberSince = formatMemberSince(user.createdAt) ?? memberSinceFor(user.id);
  const tier = verificationTierFor(user);
  // Same honesty rule as the stats strip: a rating with zero reviews is
  // a placeholder, not a reputation — it never earns card real estate.
  const hasRating = user.reviewCount > 0;
  const hasSold = typeof soldCount === 'number' && soldCount > 0;

  // Dot-separated trust line — a segment that never lands never leaves a
  // stray divider (same derivation as the hero meta line).
  const trustSegments: { key: string; node: React.ReactNode }[] = [
    ...(hasRating
      ? [
          {
            key: 'rating',
            node: (
              <span className="flex items-center gap-1.5">
                <RatingStars rating={user.rating} size={12} />
                <span className="tnum font-semibold text-text-primary">
                  {user.rating.toFixed(1)}
                </span>
                <span className="text-text-muted">({formatCount(user.reviewCount)})</span>
              </span>
            ),
          },
        ]
      : []),
    ...(hasSold
      ? [
          {
            key: 'sold',
            node: (
              <>
                <span className="tnum font-semibold text-text-primary">
                  {formatCount(soldCount)}
                </span>{' '}
                sold
              </>
            ),
          },
        ]
      : []),
    ...(memberSince ? [{ key: 'joined', node: <>Joined {memberSince}</> }] : []),
  ];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${profilePath}`);
      setCopied(true);
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      show('Could not copy link', 'error');
    }
  };

  const shareProfile = () =>
    share({
      url: `${window.location.origin}${profilePath}`,
      title: `${displayName ?? user.username} (@${user.username}) on ThryftVerse`,
      copiedLabel: 'Profile link copied',
    });

  return (
    <Sheet open={open} onClose={onClose} title="Share profile" maxWidth={420}>
      <div className="px-5 pb-6">
        {/* The passport — the one place a contained surface is the point:
            this is the artifact being shared, not a row on a canvas. */}
        <div className="rounded-xl border border-border bg-surface-alt p-5">
          <div className="flex items-center gap-4">
            <Avatar
              src={user.avatar}
              name={displayName ?? user.username}
              size={64}
              className="ring-1 ring-border"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-item-title font-semibold text-text-primary">
                  {displayName ?? user.username}
                </p>
                {user.isVerified ? (
                  <Icon
                    name="verified"
                    filled
                    size={16}
                    className="shrink-0 text-commerce-trust"
                    aria-label="Verified member"
                  />
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-caption-elevated text-text-secondary">
                @{user.username}
              </p>
              {tier ? (
                <div className="mt-2">
                  <Badge
                    variant={VERIFICATION_BADGE[tier].variant}
                    icon={VERIFICATION_BADGE[tier].icon}
                  >
                    {VERIFICATION_BADGE[tier].label}
                  </Badge>
                </div>
              ) : null}
            </div>
          </div>

          {trustSegments.length > 0 || user.bio ? (
            <div className="mt-4 border-t border-border-subtle pt-3.5">
              {trustSegments.length > 0 ? (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption-elevated text-text-secondary">
                  {trustSegments.map((s, i) => (
                    <span key={s.key} className="flex items-center gap-2">
                      {i > 0 ? (
                        <span aria-hidden className="text-text-muted">
                          ·
                        </span>
                      ) : null}
                      {s.node}
                    </span>
                  ))}
                </p>
              ) : null}
              {user.bio ? (
                <p className="clamp-2 mt-2 text-caption-elevated text-text-secondary">
                  {user.bio}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Brand footer — the wordmark marks the card as ours; the URL
              is the call to action, not decoration. */}
          <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-border-subtle pt-3.5">
            <span className="shrink-0 select-none text-caption font-extrabold tracking-[-0.4px] text-text-primary">
              ThryftVerse
            </span>
            <span className="truncate text-meta text-text-muted">
              thryftverse.com{profilePath}
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-2.5">
          <Button
            variant="secondary"
            icon={copied ? 'check' : 'link'}
            className="flex-1"
            onClick={() => void copyLink()}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button
            variant="primary"
            icon="share"
            className="flex-1"
            onClick={() => void shareProfile()}
          >
            Share
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

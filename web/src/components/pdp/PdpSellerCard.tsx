'use client';

/**
 * PdpSellerCard — seller credibility card in the PDP decision column:
 * avatar, username link, verified badge, rating + review count, response
 * speed, completed sales volume, member tenure, and Follow/Visit shop CTA.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import type { SellerTrustSummary } from '@/lib/hooks/pdp-queries';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { FollowButton } from '@/components/profile/FollowButton';
import { formatCount, formatDate } from '@/lib/utils/format';

interface PdpSellerCardProps {
  seller: Listing['seller'];
  sellerTrust?: SellerTrustSummary | null;
  isOwner: boolean;
  sellerBlocked: boolean;
}

export function PdpSellerCard({
  seller,
  sellerTrust,
  isOwner,
  sellerBlocked,
}: PdpSellerCardProps) {
  const sellerUsername = seller?.username ?? null;
  if (!sellerUsername) return null;

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle py-4">
      <Link
        href={`/u/${sellerUsername}`}
        aria-label={`Open @${sellerUsername}'s shop`}
        className="shrink-0 rounded-full"
      >
        <Avatar
          src={seller?.avatar ?? sellerTrust?.avatar}
          name={sellerTrust?.displayName ?? sellerUsername}
          size={44}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-body-emphasis text-text-primary">
          <Link
            href={`/u/${sellerUsername}`}
            className="clamp-1 hover:text-text-primary"
          >
            @{sellerUsername}
          </Link>
          {seller?.verified === true || sellerTrust?.verified === true ? (
            <Icon name="verified" size={13} className="shrink-0 text-commerce-trust" />
          ) : null}
        </p>
        {typeof seller?.rating === 'number' || typeof sellerTrust?.rating === 'number' ? (
          <p className="mt-0.5 flex items-center gap-1 text-meta text-text-secondary">
            <Icon name="star" filled size={12} className="text-rating-star" />
            <span className="tnum">
              {(seller?.rating ?? sellerTrust?.rating ?? 0).toFixed(1)}
            </span>
            {(seller?.reviewCount ?? sellerTrust?.reviewCount) ? (
              <span>
                · {formatCount(seller?.reviewCount ?? sellerTrust?.reviewCount ?? 0)}{' '}
                reviews
              </span>
            ) : null}
          </p>
        ) : null}
        {sellerTrust &&
        (sellerTrust.responseTimeLabel ||
          sellerTrust.completedSales ||
          sellerTrust.memberSince) ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-meta text-text-muted">
            {sellerTrust.responseTimeLabel ? (
              <span>Usually responds in {sellerTrust.responseTimeLabel}</span>
            ) : null}
            {sellerTrust.completedSales ? (
              <span>
                {sellerTrust.responseTimeLabel ? '· ' : ''}
                <span className="tnum">{formatCount(sellerTrust.completedSales)}</span> sold
              </span>
            ) : null}
            {sellerTrust.memberSince ? (
              <span>
                {sellerTrust.responseTimeLabel || sellerTrust.completedSales ? '· ' : ''}
                Member since {formatDate(sellerTrust.memberSince)}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      {isOwner || !seller?.id || sellerBlocked ? (
        <Link
          href={`/u/${sellerUsername}`}
          className="pressable shrink-0 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          Visit shop
        </Link>
      ) : (
        <FollowButton userId={seller.id} size="sm" className="shrink-0" />
      )}
    </div>
  );
}

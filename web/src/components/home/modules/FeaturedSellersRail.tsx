'use client';

/**
 * FeaturedSellersRail — "Featured sellers" module band. A snap-scroll
 * strip of top-rated seller cards (avatar, username, rating, listings
 * count, "View shop" affordance → /u/{username}).
 *
 * Live mode: the backend has no featured-sellers endpoint, so the rail
 * derives candidates from the real trending feed and enriches each via
 * GET /sellers/:id — real ratings and listing counts. Sellers that fail
 * to resolve are dropped, not rendered with fabricated stats; a rating
 * the backend doesn't report simply doesn't render.
 */

import Link from 'next/link';
import { DATA_MODE } from '@/lib/api/client';
import type { User } from '@/lib/contracts/domain';
import { CURRENT_USER, USERS } from '@/lib/data/fixtures';
import { useFeaturedSellers } from '@/lib/hooks/home-modules';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { formatCount } from '@/lib/utils/format';
import { ModuleSection } from './ModuleSection';
import { Rail } from './Rail';

const LIVE = DATA_MODE === 'live';

// Fixture: top sellers by rating, reviewCount as the tiebreak — exclude yourself.
const FEATURED_SELLERS: User[] = USERS.filter((u) => u.id !== CURRENT_USER.id)
  .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
  .slice(0, 6);

interface SellerCardData {
  username: string;
  avatar: string | null;
  verified: boolean;
  rating: number | null;
  reviewCount: number;
  listingCount: number;
}

function SellerCard({ seller }: { seller: SellerCardData }) {
  return (
    <Link
      href={`/u/${seller.username}`}
      role="listitem"
      aria-label={`View @${seller.username}'s shop`}
      className="pressable w-[168px] shrink-0 snap-start rounded-xl border border-border-subtle px-4 py-4 transition-colors hover:bg-surface"
    >
      <Avatar src={seller.avatar} name={seller.username} size={48} />
      <div className="mt-2.5 flex items-center gap-1">
        <span className="clamp-1 text-body font-semibold text-text-primary">
          @{seller.username}
        </span>
        {seller.verified ? (
          <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
        ) : null}
      </div>
      {seller.rating !== null ? (
        <div className="mt-1 flex items-center gap-1 text-meta text-text-secondary">
          <Icon name="star" filled size={11} className="text-rating-star" />
          <span className="tnum font-medium">{seller.rating.toFixed(1)}</span>
          <span className="text-text-muted">· {formatCount(seller.reviewCount)} reviews</span>
        </div>
      ) : null}
      <div className="mt-0.5 text-meta text-text-muted">{seller.listingCount} listings</div>
      <span className="mt-3 flex items-center gap-0.5 text-caption font-semibold text-brand">
        View shop
        <Icon name="forward" size={12} />
      </span>
    </Link>
  );
}

export function FeaturedSellersRail() {
  const live = useFeaturedSellers();

  const sellers: SellerCardData[] = LIVE
    ? (live.data ?? []).map((s) => ({
        username: s.username,
        avatar: s.avatar,
        verified: s.verified,
        rating: s.rating,
        reviewCount: s.reviewCount,
        listingCount: s.activeListingCount,
      }))
    : FEATURED_SELLERS.map((u) => ({
        username: u.username,
        avatar: u.avatar,
        verified: u.isVerified,
        rating: u.rating,
        reviewCount: u.reviewCount,
        listingCount: u.listingCount,
      }));

  if (sellers.length === 0) return null;
  return (
    <ModuleSection title="Featured sellers" moduleId="featured-sellers">
      <Rail label="Featured sellers">
        {sellers.map((seller) => (
          <SellerCard key={seller.username} seller={seller} />
        ))}
      </Rail>
    </ModuleSection>
  );
}

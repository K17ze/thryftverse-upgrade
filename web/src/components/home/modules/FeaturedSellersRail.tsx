'use client';

/**
 * FeaturedSellersRail — "Featured sellers" module band. A snap-scroll
 * strip of top-rated seller cards (avatar, username, rating, listings
 * count, "View shop" affordance → /u/{username}).
 */

import Link from 'next/link';
import type { User } from '@/lib/contracts/domain';
import { CURRENT_USER, USERS } from '@/lib/data/fixtures';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { formatCount } from '@/lib/utils/format';
import { ModuleSection } from './ModuleSection';
import { Rail } from './Rail';

// Top sellers by rating, reviewCount as the tiebreak — exclude yourself.
const FEATURED_SELLERS: User[] = USERS.filter((u) => u.id !== CURRENT_USER.id)
  .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
  .slice(0, 6);

function SellerCard({ user }: { user: User }) {
  return (
    <Link
      href={`/u/${user.username}`}
      role="listitem"
      aria-label={`View @${user.username}'s shop`}
      className="pressable w-[168px] shrink-0 snap-start rounded-xl border border-border-subtle px-4 py-4 transition-colors hover:bg-surface"
    >
      <Avatar src={user.avatar} name={user.username} size={48} />
      <div className="mt-2.5 flex items-center gap-1">
        <span className="clamp-1 text-body font-semibold text-text-primary">
          @{user.username}
        </span>
        {user.isVerified ? (
          <Icon name="verified" filled size={13} className="shrink-0 text-success-text" />
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-1 text-meta text-text-secondary">
        <Icon name="star" filled size={11} className="text-rating-star" />
        <span className="tnum font-medium">{user.rating.toFixed(1)}</span>
        <span className="text-text-muted">· {formatCount(user.reviewCount)} reviews</span>
      </div>
      <div className="mt-0.5 text-meta text-text-muted">{user.listingCount} listings</div>
      <span className="mt-3 flex items-center gap-0.5 text-caption font-semibold text-brand">
        View shop
        <Icon name="forward" size={12} />
      </span>
    </Link>
  );
}

export function FeaturedSellersRail() {
  return (
    <ModuleSection title="Featured sellers">
      <Rail label="Featured sellers">
        {FEATURED_SELLERS.map((user) => (
          <SellerCard key={user.id} user={user} />
        ))}
      </Rail>
    </ModuleSection>
  );
}

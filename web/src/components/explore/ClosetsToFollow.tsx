'use client';

/**
 * ClosetsToFollow — the member-discovery band on Explore (Vinted
 * "members to follow" grammar). Compact closet cards: avatar, @handle,
 * live item count, a real Follow toggle — the card's media/identity is
 * the link, the button is a sibling (no nested-interactive anchors).
 *
 * Fixture mode ranks USERS by follower reach (the member dataset is the
 * truth there). Live mode shares useFeaturedSellers — sellers are
 * derived from the real trending feed and enriched via GET /sellers/:id;
 * members that fail to resolve drop out rather than rendering
 * fabricated stats, and the whole band hides while it settles.
 */

import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { FollowButton } from '@/components/profile/FollowButton';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { Rail } from '@/components/home/modules/Rail';
import { DATA_MODE } from '@/lib/api/client';
import { CURRENT_USER, USERS } from '@/lib/data/fixtures';
import { useFeaturedSellers } from '@/lib/hooks/home-modules';

const LIVE = DATA_MODE === 'live';

// Fixture: widest-reach closets first — yourself is never a suggestion.
const FIXTURE_CLOSETS = USERS.filter((u) => u.id !== CURRENT_USER.id)
  .sort((a, b) => b.followers - a.followers)
  .slice(0, 6);

interface ClosetCardData {
  id: string;
  username: string;
  avatar: string | null;
  verified: boolean;
  itemCount: number;
}

function ClosetCard({ member }: { member: ClosetCardData }) {
  return (
    <div
      role="listitem"
      className="w-[176px] shrink-0 snap-start rounded-xl border border-border-subtle px-4 py-4"
    >
      <Link
        href={`/u/${member.username}`}
        aria-label={`@${member.username}'s closet — ${member.itemCount} item${member.itemCount === 1 ? '' : 's'}`}
        className="pressable block rounded-md"
      >
        <Avatar src={member.avatar} name={member.username} size={48} />
        <span className="mt-2.5 flex items-center gap-1">
          <span className="clamp-1 text-body font-semibold text-text-primary">
            @{member.username}
          </span>
          {member.verified ? (
            <Icon
              name="verified"
              filled
              size={13}
              className="shrink-0 text-commerce-trust"
            />
          ) : null}
        </span>
        <span className="tnum mt-1 block text-meta text-text-muted">
          {member.itemCount} item{member.itemCount === 1 ? '' : 's'}
        </span>
      </Link>
      <FollowButton
        userId={member.id}
        size="sm"
        className="mt-3 w-full"
      />
    </div>
  );
}

export function ClosetsToFollow() {
  const live = useFeaturedSellers();

  const members: ClosetCardData[] = LIVE
    ? (live.data ?? []).map((s) => ({
        id: s.id,
        username: s.username,
        avatar: s.avatar,
        verified: s.verified,
        itemCount: s.activeListingCount,
      }))
    : FIXTURE_CLOSETS.map((u) => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        verified: u.isVerified,
        itemCount: u.listingCount,
      }));

  // Editorial density, not critical path — an unsettled or empty live
  // read hides the band rather than flashing skeleton cards.
  if (members.length === 0 || (LIVE && live.isLoading)) return null;

  return (
    <ModuleSection title="Closets to follow">
      <Rail label="Members to follow">
        {members.map((member) => (
          <ClosetCard key={member.id} member={member} />
        ))}
      </Rail>
    </ModuleSection>
  );
}

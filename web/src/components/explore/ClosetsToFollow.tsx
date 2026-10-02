'use client';

/**
 * ClosetsToFollow — the member-discovery band on Explore (Vinted
 * "members to follow" grammar). Flat hairline rows — avatar, @handle,
 * live item count, a real Follow toggle at the trailing edge — the same
 * member-row grammar as search's MemberResults, composed two-up at lg
 * (three-up at xl). The row's identity half is the link; the button is
 * a sibling (no nested-interactive anchors).
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
import { DATA_MODE } from '@/lib/api/client';
import { CURRENT_USER, USERS } from '@/lib/data/fixtures';
import { useFeaturedSellers } from '@/lib/hooks/home-modules';

const LIVE = DATA_MODE === 'live';

// Fixture: widest-reach closets first — yourself is never a suggestion.
const FIXTURE_CLOSETS = USERS.filter((u) => u.id !== CURRENT_USER.id)
  .sort((a, b) => b.followers - a.followers)
  .slice(0, 6);

interface ClosetRowData {
  id: string;
  username: string;
  avatar: string | null;
  verified: boolean;
  itemCount: number;
}

function ClosetRow({ member }: { member: ClosetRowData }) {
  return (
    <li className="lg:border-b lg:border-border-subtle">
      <div className="flex items-center gap-3">
        <Link
          href={`/u/${member.username}`}
          aria-label={`@${member.username}'s closet — ${member.itemCount} item${member.itemCount === 1 ? '' : 's'}`}
          className="pressable -mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-row"
        >
          <Avatar src={member.avatar} name={member.username} size={40} />
          <span className="min-w-0">
            <span className="flex items-center gap-1">
              <span className="truncate text-body font-medium text-text-primary">
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
            <span className="tnum mt-0.5 block text-meta text-text-muted">
              {member.itemCount} item{member.itemCount === 1 ? '' : 's'}
            </span>
          </span>
        </Link>
        <FollowButton userId={member.id} size="sm" className="shrink-0" />
      </div>
    </li>
  );
}

export function ClosetsToFollow() {
  const live = useFeaturedSellers();

  const members: ClosetRowData[] = LIVE
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
  // read hides the band rather than flashing skeleton rows.
  if (members.length === 0 || (LIVE && live.isLoading)) return null;

  return (
    <ModuleSection title="Closets to follow">
      {/* Same member-row grammar as MemberResults — hairline-separated,
          composed into columns once the viewport has the room. */}
      <ul className="divide-y divide-border-subtle px-4 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:divide-y-0 xl:grid-cols-3">
        {members.map((member) => (
          <ClosetRow key={member.id} member={member} />
        ))}
      </ul>
    </ModuleSection>
  );
}

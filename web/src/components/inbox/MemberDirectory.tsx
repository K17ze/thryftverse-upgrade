'use client';

/**
 * MemberDirectory — the members section of the group info surface, ported
 * from mobile GroupMembersDirectory: "N members" header with a search
 * toggle, the brand-accented "Add members" row for managers, member rows
 * collapsed to five behind "See all", all flat with inset hairlines.
 */

import { useMemo, useState } from 'react';
import type { ConversationParticipant } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { InfoRow } from './InfoSection';
import { MemberRow } from './MemberRow';
import type { GroupMemberRole } from './groupAdmin';

const COLLAPSED_MEMBER_LIMIT = 5;

export function MemberDirectory({
  memberCount,
  members,
  memberRoles,
  viewerId,
  canAddMembers,
  onAddMembers,
  onMemberPress,
}: {
  memberCount: number;
  members: ConversationParticipant[];
  memberRoles?: Record<string, GroupMemberRole>;
  viewerId: string;
  canAddMembers: boolean;
  onAddMembers: () => void;
  onMemberPress: (member: ConversationParticipant & { role?: GroupMemberRole }) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return members;
    const q = query.trim().toLowerCase();
    return members.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        (m.displayName ?? '').toLowerCase().includes(q),
    );
  }, [members, query]);

  const collapsed = !searchOpen && !expanded;
  const displayed = collapsed ? filtered.slice(0, COLLAPSED_MEMBER_LIMIT) : filtered;
  const showSeeAll = memberCount > COLLAPSED_MEMBER_LIMIT && collapsed;
  const tailRowCount = showSeeAll ? 1 : 0;
  const lastMemberIndex = displayed.length - 1;

  return (
    <section className="mt-6">
      <div className="mb-1.5 flex items-center justify-between px-4">
        <h2 className="text-meta font-semibold uppercase tracking-wide text-text-muted">
          {memberCount} member{memberCount === 1 ? '' : 's'}
        </h2>
        <IconButton
          name={searchOpen ? 'close' : 'search'}
          size={18}
          aria-label={searchOpen ? 'Close member search' : 'Search members'}
          className="-mr-2 -my-2"
          onClick={() => {
            setSearchOpen((v) => {
              if (v) setQuery('');
              return !v;
            });
          }}
        />
      </div>

      {searchOpen ? (
        <div className="mx-4 mb-2">
          <label
            className={`flex h-9 items-center gap-2 rounded-md border bg-surface-alt px-2.5 ${
              query ? 'border-brand' : 'border-border'
            }`}
          >
            <Icon name="search" size={15} className="text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search member name or @handle"
              aria-label="Search members"
              autoFocus
              autoCapitalize="none"
              className="w-full bg-transparent text-meta text-input-text placeholder:text-text-muted focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear member search"
                className="pressable text-text-muted"
              >
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </label>
        </div>
      ) : null}

      {canAddMembers && !searchOpen ? (
        <InfoRow
          icon="personAdd"
          tone="brand"
          label="Add members"
          onPress={onAddMembers}
          isLast={displayed.length === 0}
        />
      ) : null}

      {displayed.length === 0 ? (
        <p className="px-4 py-5 text-center text-meta text-text-muted">
          {query ? 'No members match your search' : 'No members'}
        </p>
      ) : (
        displayed.map((member, index) => {
          const role = memberRoles?.[member.id];
          const isYou = member.id === viewerId;
          const isLast = index === lastMemberIndex && tailRowCount === 0;
          return (
            <MemberRow
              key={member.id}
              name={isYou ? 'You' : (member.displayName ?? member.username)}
              handle={`@${member.username}`}
              avatarUrl={member.avatar}
              role={role}
              verified={member.identityVerified}
              isLast={isLast}
              onPress={() => onMemberPress({ ...member, role })}
            />
          );
        })
      )}

      {showSeeAll ? (
        <InfoRow
          icon="more"
          label={`See all (${memberCount} members)`}
          onPress={() => setExpanded(true)}
          showChevron={false}
          isLast
        />
      ) : null}
    </section>
  );
}

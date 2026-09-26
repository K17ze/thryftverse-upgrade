'use client';

/**
 * ConnectionsView — followers / following lists (the mobile
 * ConnectionListScreen's web counterpart). Row grammar: avatar, name +
 * verified marker, one bio line, follow state. Lists over 20 entries get
 * a client-side search. Fixture pools are deterministic per profile; the
 * session's own following list reads the persisted follow store once
 * hydrated, so toggles here agree with the hero button.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { useFollows } from '@/lib/store/follows';
import { useHydrated } from '@/lib/store/useStore';
import { USERS, CURRENT_USER } from '@/lib/data/fixtures';
import { formatCount } from '@/lib/utils/format';
import type { User } from '@/lib/contracts/domain';

export type ConnectionKind = 'followers' | 'following';

function pool(user: User, kind: ConnectionKind, followingIds: string[]): User[] {
  // Own following list is the truth we persist.
  if (kind === 'following' && user.id === CURRENT_USER.id) {
    return USERS.filter((u) => followingIds.includes(u.id));
  }
  // Deterministic fixture pool — stable per profile, excludes the
  // profile's owner, sized by the real count the profile advertises.
  const candidates = USERS.filter((u) => u.id !== user.id);
  const seed = [...user.username].reduce((a, c) => a + c.charCodeAt(0), 0) + (kind === 'following' ? 3 : 0);
  const rotated = candidates.map((u, i) => candidates[(i + seed) % candidates.length]);
  const target = kind === 'following' ? user.following : user.followers;
  return rotated.slice(0, Math.min(candidates.length, Math.max(1, Math.min(target, candidates.length))));
}

function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-busy aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-0">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConnectionsView({ user, kind }: { user: User; kind: ConnectionKind }) {
  const hydrated = useHydrated();
  const followingIds = useFollows((s) => s.followingIds);
  const [query, setQuery] = useState('');

  // Persisted follows land after hydrate — gate so SSR and the first
  // client render agree before the local store settles.
  const rows = useMemo(
    () => pool(user, kind, hydrated ? followingIds : []),
    [user, kind, followingIds, hydrated],
  );
  const pending = kind === 'following' && user.id === CURRENT_USER.id && !hydrated;

  const searchable = rows.length > 20;
  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          (u.bio ?? '').toLowerCase().includes(q),
      )
    : rows;

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="px-4 pt-5 sm:px-0">
        <h1 className="text-screen-title font-bold text-text-primary">
          {kind === 'followers' ? 'Followers' : 'Following'}
        </h1>
        <p className="mt-0.5 text-body text-text-muted">@{user.username}</p>
      </div>

      <div className="mt-4">
        <ProfileTabs
          tabs={[
            { key: 'followers', label: 'Followers', href: `/u/${user.username}/followers` },
            { key: 'following', label: 'Following', href: `/u/${user.username}/following` },
          ]}
          active={kind}
        />
      </div>

      {searchable ? (
        <div className="relative px-4 pb-1 pt-4 sm:px-0">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${kind}`}
            aria-label={`Search ${kind}`}
            autoComplete="off"
            className="h-9 w-full rounded-md bg-surface-alt pl-9 pr-3 text-body text-input-text placeholder:text-text-muted"
          />
        </div>
      ) : null}

      {pending ? (
        <div className="pt-2">
          <RowSkeleton />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="follow"
          title={kind === 'following' ? 'Not following anyone yet' : 'No followers yet'}
          subtitle={
            kind === 'following'
              ? 'Follow sellers and curators to see their new items first.'
              : 'Share your profile to get discovered.'
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="No members match"
          subtitle={`Nothing here fits “${query.trim()}”.`}
          compact
        />
      ) : (
        <ul className="divide-y divide-border-subtle pt-2">
          {visible.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3 sm:px-0">
              <Link href={`/u/${u.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={u.avatar} name={u.username} size={44} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-body font-semibold text-text-primary">
                      {u.username}
                    </span>
                    {u.isVerified ? (
                      <Icon
                        name="verified"
                        filled
                        size={13}
                        className="shrink-0 text-commerce-trust"
                        aria-label="Verified member"
                      />
                    ) : null}
                  </span>
                  <span className="clamp-1 block text-meta text-text-muted">
                    {u.bio ?? `${formatCount(u.followers)} followers`}
                  </span>
                </span>
              </Link>
              {u.id !== CURRENT_USER.id ? (
                <FollowButton userId={u.id} size="sm" className="shrink-0" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

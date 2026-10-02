'use client';

/**
 * ConnectionsView — followers / following lists (the mobile
 * ConnectionListScreen's web counterpart): back affordance, @username
 * context header, Followers|Following route tabs with counts, an always-on
 * search field (with a clear affordance), then rows in mobile grammar —
 * avatar, name + verified marker, one bio line, follow state. Fixture
 * pools are deterministic per profile; the session's own following list
 * reads the persisted follow store once hydrated, so toggles here agree
 * with the hero button.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { BackBar } from '@/components/profile/BackBar';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { useFollows } from '@/lib/store/follows';
import { useHydrated } from '@/lib/store/useStore';
import { DATA_MODE } from '@/lib/api/client';
import { fetchFollowers, fetchFollowingList } from '@/lib/api/services/users';
import { useSession } from '@/lib/session/SessionProvider';
import { USERS, CURRENT_USER } from '@/lib/data/fixtures';
import { formatCount } from '@/lib/utils/format';
import type { User } from '@/lib/contracts/domain';

const LIVE = DATA_MODE === 'live';

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

/** Route-level loading state — title line + list rows (not the hero
 *  skeleton, which belongs to profile surfaces). */
export function ConnectionsSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-5 sm:px-0 lg:max-w-[720px]" aria-busy aria-label="Loading connections">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-5 h-10 w-full rounded-none" />
      <div className="mt-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-3 lg:grid lg:grid-cols-[2.75rem_minmax(0,1.1fr)_minmax(0,1.3fr)_auto] lg:gap-x-6"
          >
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5 lg:contents">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-busy aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 sm:px-0 lg:grid lg:grid-cols-[2.75rem_minmax(0,1.1fr)_minmax(0,1.3fr)_auto] lg:gap-x-6"
        >
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5 lg:contents">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="hidden h-8 w-24 rounded-md lg:block" />
        </div>
      ))}
    </div>
  );
}

/** Normalized row — fixture User and live FollowListUser share a card. */
interface ConnectionRow {
  id: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
  subline: string;
}

export function ConnectionsView({ user, kind }: { user: User; kind: ConnectionKind }) {
  const hydrated = useHydrated();
  const followingIds = useFollows((s) => s.followingIds);
  const { user: me } = useSession();
  const [query, setQuery] = useState('');

  // Live: the backend's own followers/following lists — no fabricated
  // pools. Pages walk the service's nextCursor (mobile's 40-row page
  // size) so deep follow graphs paginate instead of truncating at page
  // one; `select` flattens pages into the row list.
  const liveQuery = useInfiniteQuery({
    queryKey: ['connections', user.id, kind],
    queryFn: ({ pageParam, signal }) =>
      kind === 'followers'
        ? fetchFollowers(user.id, pageParam, signal)
        : fetchFollowingList(user.id, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: LIVE && Boolean(user.id),
    staleTime: 60_000,
    select: (d) => d.pages.flatMap((p) => p.items),
  });
  const liveItems = useMemo(() => liveQuery.data ?? [], [liveQuery.data]);

  // Wire follow state is server truth — seed the persisted set so rows
  // the viewer follows render "Following" even when the session hydrate
  // hasn't landed them yet. Union-only, so a stale wire `false` can't
  // clobber an optimistic toggle.
  const seedFollowing = useFollows((s) => s.seedFollowing);
  useEffect(() => {
    if (!LIVE) return;
    seedFollowing(
      liveItems.filter((u) => u.isFollowing === true).map((u) => u.id),
    );
  }, [liveItems, seedFollowing]);

  // Persisted follows land after hydrate — gate so SSR and the first
  // client render agree before the local store settles.
  const rows: ConnectionRow[] = useMemo(() => {
    if (LIVE) {
      return liveItems.map((u) => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        // Fail-closed — the backend doesn't emit a verification field on
        // follow rows yet, so no badge until the wire carries one.
        isVerified: u.isVerified === true,
        subline: u.displayName ?? '',
      }));
    }
    return pool(user, kind, hydrated ? followingIds : []).map((u) => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      isVerified: u.isVerified,
      subline: u.bio ?? `${formatCount(u.followers)} followers`,
    }));
  }, [user, kind, followingIds, hydrated, liveItems]);
  const pending = LIVE
    ? liveQuery.isLoading
    : kind === 'following' && user.id === CURRENT_USER.id && !hydrated;

  const q = query.trim().toLowerCase();
  const visible = q
    ? rows.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.subline.toLowerCase().includes(q),
      )
    : rows;

  return (
    <div className="mx-auto w-full max-w-xl lg:max-w-[720px]">
      <BackBar />
      {/* Context header — the tabs carry the mode, so the title is the
          member, not a repeat of the active tab label. */}
      <div className="px-4 pt-1 sm:px-0">
        <h1 className="text-item-title font-bold text-text-primary">@{user.username}</h1>
      </div>

      <div className="mt-2">
        <ProfileTabs
          ariaLabel="Connections"
          tabs={[
            {
              key: 'followers',
              label: 'Followers',
              count: user.followers,
              href: `/u/${user.username}/followers`,
            },
            {
              key: 'following',
              label: 'Following',
              count: user.following,
              href: `/u/${user.username}/following`,
            },
          ]}
          active={kind}
        />
      </div>

      {rows.length > 0 ? (
        <div className="px-4 pb-1 pt-4 sm:px-0">
          <div className="relative">
            <Icon
              name="search"
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kind}`}
              aria-label={`Search ${kind}`}
              autoComplete="off"
              className="h-9 w-full rounded-md border border-transparent bg-surface-alt pl-9 pr-9 text-body text-input-text placeholder:text-text-muted focus:border-border focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="pressable absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-text-muted hover:text-text-primary"
              >
                <Icon name="close" size={15} />
              </button>
            ) : null}
          </div>
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
        <>
          <ul className="divide-y divide-border-subtle pt-2">
            {visible.map((u) => (
              // lg: the link's wrappers dissolve (display:contents, the
              // AgentRunRow trick) so the row re-forms as columns —
              // avatar | member | meta | action — the Vinted follower-
              // list grammar: one list, not a 576px phone strip.
              <li
                key={u.id}
                className="flex items-center gap-3 px-4 py-3 sm:px-0 lg:grid lg:grid-cols-[2.75rem_minmax(0,1.1fr)_minmax(0,1.3fr)_auto] lg:gap-x-6 lg:has-[:focus-visible]:bg-surface-alt/60"
              >
                <Link
                  href={`/u/${u.username}`}
                  className="pressable flex min-w-0 flex-1 items-center gap-3 rounded-md lg:contents"
                  aria-label={`Open @${u.username}'s profile`}
                >
                  <Avatar src={u.avatar} name={u.username} size={44} />
                  <span className="min-w-0 lg:contents">
                    <span className="flex min-w-0 items-center gap-1">
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
                    <span className="clamp-1 block min-w-0 text-meta text-text-muted">
                      {u.subline}
                    </span>
                  </span>
                </Link>
                {u.id !== (LIVE ? me?.id : CURRENT_USER.id) ? (
                  <FollowButton
                    userId={u.id}
                    size="sm"
                    className="shrink-0 lg:justify-self-end"
                  />
                ) : null}
              </li>
            ))}
          </ul>

          {/* List pagination — the service's nextCursor drives Load
              more; a failed page gets an honest retry, an exhausted
              list ends quietly. Fixture pools return their full set, so
              this stays live-only in practice. */}
          {liveQuery.hasNextPage ||
          liveQuery.isFetchingNextPage ||
          liveQuery.isFetchNextPageError ? (
            <div className="mt-4 flex justify-center pb-2">
              <Button
                variant="outline"
                size="sm"
                disabled={liveQuery.isFetchingNextPage}
                onClick={() => void liveQuery.fetchNextPage()}
              >
                {liveQuery.isFetchingNextPage
                  ? 'Loading…'
                  : liveQuery.isFetchNextPageError
                    ? 'Couldn’t load more — try again'
                    : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

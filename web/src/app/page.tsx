'use client';

/**
 * Home — port of HomeScreen, in the mobile module order: the sticky
 * control bar leads (For you / Following tabs + signal chip rail), then
 * the poster story rail, then the authored feed — a product rail, denser
 * masonry, and quiet editorial/members breaks interleaved.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StoryRail } from '@/components/feed/StoryRail';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { useMasonryColumns } from '@/components/feed/MasonryGrid';
import { HomeFeed } from '@/components/home/HomeFeed';
import { EntryBand } from '@/components/home/modules/EntryBand';
import { HOME_SIGNALS, matchesHomeSignal } from '@/components/home/homeSignals';
import { rankFeedUnits } from '@/components/home/rankFeed';
import { Chip } from '@/components/ui/Chip';
import { useFeed } from '@/lib/hooks/queries';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { useFollows } from '@/lib/store/follows';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';

type FeedMode = 'foryou' | 'following';

/** Fixture-truth followed sellers — the set the Following feed is built from. */
const FOLLOWED_SELLERS = new Set(['u1', 'u3', 'u5']);

export default function HomePage() {
  const router = useRouter();
  const columns = useMasonryColumns();
  const { data, isLoading } = useFeed();
  const [mode, setMode] = useState<FeedMode>('foryou');
  const [signal, setSignal] = useState('all');

  // Personalization signals — persisted stores are gated behind hydration
  // so SSR and the first client render produce the same feed order.
  const hydrated = useHydrated();
  const wishlist = useStore((s) => s.wishlist);
  const followedIds = useFollows((s) => s.followingIds);
  const likedIds = useMemo(() => (hydrated ? wishlist : []), [hydrated, wishlist]);
  const followingIds = useMemo(() => (hydrated ? followedIds : []), [hydrated, followedIds]);

  // Count shown on the Following tab — listing units from followed sellers.
  const followingCount = useMemo(
    () =>
      (data?.units ?? []).filter(
        (u) => u.type === 'listing' && FOLLOWED_SELLERS.has(u.listing.sellerId),
      ).length,
    [data],
  );

  const units = useMemo<DiscoveryFeedUnit[]>(() => {
    let source = data?.units ?? [];
    if (mode === 'following') {
      // Following: only creator units + listings from followed sellers.
      source = source.filter(
        (u) => u.type !== 'listing' || FOLLOWED_SELLERS.has(u.listing.sellerId),
      );
    }
    if (signal !== 'all') {
      // Signal chips filter listings across identity fields; authored
      // units (looks, posters, boards) stay — they carry no department.
      source = source.filter(
        (u) => u.type !== 'listing' || matchesHomeSignal(u.listing, signal),
      );
    }
    // Like/follow-driven ordering — runs after filtering so the signal
    // chips stay authoritative; authored units hold their positions.
    return rankFeedUnits(source, { likedIds, followingIds });
  }, [data, mode, signal, likedIds, followingIds]);

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* Control bar first — tabs + signal rail pin on scroll (mobile
          HomeFeedHeader order: tabs → signal chips → stories → feed). */}
      <div className="sticky top-16 z-elevated flex items-center gap-3 border-b border-border-subtle bg-background/95 px-4 py-2 backdrop-blur-sm sm:px-6">
        <SegmentedControl
          options={[
            { value: 'foryou', label: 'For you' },
            { value: 'following', label: 'Following', count: followingCount },
          ]}
          value={mode}
          onChange={setMode}
        />
        <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
          {HOME_SIGNALS.map((s) => (
            <Chip key={s.key} selected={signal === s.key} onClick={() => setSignal(s.key)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <StoryRail />

      {/* Authored entry band — taste-led ways into the catalogue, each
          tile derived from listing truth and linking to a route that
          resolves (Vinted's curated-selections answer to the feed). */}
      <EntryBand />

      <HomeFeed
        units={units}
        columns={columns}
        isLoading={isLoading}
        empty={
          mode === 'following'
            ? signal === 'all'
              ? {
                  title: 'Nothing from members you follow yet',
                  subtitle:
                    'When members you follow list new items, they land here.',
                  actionLabel: 'Find members to follow',
                  onAction: () => router.push('/explore'),
                }
              : {
                  title: 'Nothing in this signal yet',
                  subtitle:
                    'Members you follow have nothing here — try another signal.',
                }
            : undefined
        }
      />
    </div>
  );
}

'use client';

/**
 * Explore — port of UnifiedDiscoveryScreen, restructured as a topic-led
 * surface: discovery search header, visual category tiles, a trending
 * topics band, an authored looks/moodboards band, then the inspiration
 * masonry feed (listings + looks + posters + moodboards + editorial
 * breaks).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MasonryGrid } from '@/components/feed/MasonryGrid';
import { useResultColumns } from '@/components/filters/useResultColumns';
import { AppImage } from '@/components/ui/AppImage';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { TrendingTopics } from '@/components/explore/TrendingTopics';
import { LooksMoodboards } from '@/components/explore/LooksMoodboards';
import { SearchField } from '@/components/search/SearchField';
import { CATEGORY_DIRECTORY } from '@/components/search/taxonomy';
import { useFeed } from '@/lib/hooks/queries';
import type { DiscoveryFeedUnit } from '@/lib/contracts/domain';

export default function ExplorePage() {
  const router = useRouter();
  const columns = useResultColumns();
  const { data, isLoading } = useFeed();
  const [q, setQ] = useState('');

  const units = useMemo<DiscoveryFeedUnit[]>(() => data?.units ?? [], [data]);

  const submit = (term: string) => {
    const query = term.trim();
    if (query) router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      {/* Discovery search header — dominant, quiet */}
      <div className="px-4 pb-4 pt-5 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">Explore</h1>
        <SearchField
          value={q}
          onChange={setQ}
          onSubmit={submit}
          placeholder="Search for ideas, items and members"
          className="mt-3 max-w-2xl"
        />
      </div>

      {/* Visual category tiles — media-first, one row scroll */}
      <div
        className="no-scrollbar flex gap-2.5 overflow-x-auto px-4 sm:px-6"
        role="list"
        aria-label="Categories"
      >
        {CATEGORY_DIRECTORY.map((cat) => (
          <Link
            key={cat.slug}
            href={`/category/${cat.slug}`}
            role="listitem"
            aria-label={
              cat.count > 0
                ? `${cat.name} — ${cat.count} item${cat.count === 1 ? '' : 's'}`
                : `${cat.name} — browse the category`
            }
            className="pressable group relative h-24 w-40 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-48"
          >
            <AppImage
              src={cat.image}
              alt={cat.name}
              fill
              sizes="(max-width: 640px) 160px, 192px"
              className="h-full w-full"
              imgClassName="transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
            <span className="absolute bottom-2 left-2.5 right-2.5">
              <span className="block text-body-emphasis font-semibold text-scrim-text-primary">
                {cat.name}
              </span>
              {cat.count ? (
                <span className="tnum mt-0.5 block text-caption font-medium text-scrim-text-secondary">
                  {cat.count} item{cat.count === 1 ? '' : 's'}
                </span>
              ) : null}
            </span>
          </Link>
        ))}
      </div>

      <TrendingTopics />
      <LooksMoodboards />

      {/* Inspiration feed — authored masonry under its own section header. */}
      <ModuleSection title="Made for you">
        <MasonryGrid units={units} columns={columns} isLoading={isLoading} />
      </ModuleSection>
    </div>
  );
}

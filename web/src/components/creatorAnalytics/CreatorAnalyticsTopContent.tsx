'use client';

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { formatCount } from '@/lib/utils/format';
import type {
  ContentRankingItem,
  ContentRankingResponse,
} from '@/lib/api/services/creatorAnalytics';
import { formatRate, SectionLabel } from './CreatorAnalyticsPrimitives';

export function contentHref(item: ContentRankingItem): string {
  return item.contentType === 'look'
    ? `/look/${item.contentId}`
    : `/poster/${item.contentId}`;
}

interface CreatorAnalyticsTopContentProps {
  ranking: ContentRankingResponse | undefined;
}

export function CreatorAnalyticsTopContent({ ranking }: CreatorAnalyticsTopContentProps) {
  if (!ranking || ranking.items.length === 0) return null;

  return (
    <section className="mt-8" aria-label="Top content">
      <SectionLabel>Top content</SectionLabel>
      <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
        {ranking.items.map((item: ContentRankingItem, i: number) => (
          <li key={`${item.contentType}:${item.contentId}`}>
            <Link
              href={contentHref(item)}
              className="pressable flex items-center gap-3.5 py-3"
            >
              <span className="tnum w-4 shrink-0 text-center text-meta text-text-muted">
                {i + 1}
              </span>
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                <AppImage
                  src={item.thumbnailUrl}
                  alt={item.title}
                  fill
                  sizes="48px"
                  fallbackIcon={item.contentType === 'look' ? 'tag' : 'image'}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-body-emphasis font-medium text-text-primary">
                  {item.title}
                </span>
                <span className="tnum mt-0.5 block text-meta text-text-muted">
                  {formatCount(item.views)} views · {formatRate(item.engagementRate)} engagement
                </span>
              </span>
              <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

'use client';

/**
 * TrendingTopics — pill-free editorial trend row: portrait media tiles
 * with the topic as the only label, deep-linking into taxonomy
 * subcategories and catalogue queries. Snap-scroll rail on mobile,
 * one authored row (or two) on larger screens.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { TRENDING_TOPICS } from './topics';

export function TrendingTopics() {
  return (
    <ModuleSection title="Trending topics" href="/search" bordered={false}>
      <div
        className="no-scrollbar flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-6 lg:grid-cols-6"
        role="list"
        aria-label="Trending topics"
      >
        {TRENDING_TOPICS.map((topic) => (
          <Link
            key={topic.label}
            href={topic.href}
            role="listitem"
            aria-label={`${topic.label} — explore the topic`}
            className="pressable group relative block w-40 shrink-0 snap-start overflow-hidden rounded-lg sm:w-auto"
          >
            <AppImage
              src={topic.image}
              alt={topic.label}
              aspectRatio={0.75}
              sizes="(max-width: 640px) 160px, (max-width: 1024px) 30vw, 16vw"
              className="w-full"
              imgClassName="transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
            <span className="clamp-1 absolute inset-x-3 bottom-2.5 text-body-emphasis font-semibold text-scrim-text-primary">
              {topic.label}
            </span>
          </Link>
        ))}
      </div>
    </ModuleSection>
  );
}

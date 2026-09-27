'use client';

/**
 * CuratedEditsRail — the "Curated edits" band on Explore. Member-authored
 * collections rendered as cover cards that deep-link to the shareable
 * landing at /explore/collection/[id] — the same mobile mechanic
 * (ExploreCollection opens a real destination, not a sheet).
 *
 * Cards that resolve to zero live items still render — the landing owns
 * the honest restock state.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ModuleSection } from '@/components/home/modules/ModuleSection';
import { Rail } from '@/components/home/modules/Rail';
import {
  CURATED_COLLECTIONS,
  curatorFor,
  type CuratedCollection,
} from '@/lib/data/fixtures-collections';

function CuratedEditCard({ collection }: { collection: CuratedCollection }) {
  const curator = curatorFor(collection);
  return (
    <Link
      href={`/explore/collection/${collection.id}`}
      role="listitem"
      aria-label={`${collection.title} — ${collection.itemIds.length} pieces, curated by ${
        curator ? `@${curator.username}` : 'ThryftVerse'
      }`}
      className="pressable group relative block aspect-[3/4] w-[200px] shrink-0 snap-start overflow-hidden rounded-lg bg-surface-alt sm:w-[230px]"
    >
      <AppImage
        src={collection.coverUri}
        alt={collection.title}
        fill
        sizes="(max-width: 640px) 200px, 230px"
        className="h-full w-full media-zoom"
        fallbackIcon="layers"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-label font-semibold uppercase tracking-[0.12em] text-scrim-text-secondary">
          {collection.theme}
        </p>
        <h3 className="clamp-1 mt-1 text-item-title font-semibold text-scrim-text-primary">
          {collection.title}
        </h3>
        {curator ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-meta text-scrim-text-secondary">
            <Avatar src={curator.avatar} name={curator.username} size={18} />
            <span className="clamp-1 font-medium">@{curator.username}</span>
            {curator.isVerified ? (
              <Icon name="verified" filled size={11} className="text-scrim-text-primary" />
            ) : null}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function CuratedEditsRail() {
  if (CURATED_COLLECTIONS.length === 0) return null;
  return (
    <ModuleSection title="Curated edits" href="/collections">
      <Rail label="Curated collections by members">
        {CURATED_COLLECTIONS.map((c) => (
          <CuratedEditCard key={c.id} collection={c} />
        ))}
      </Rail>
    </ModuleSection>
  );
}

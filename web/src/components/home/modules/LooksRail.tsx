'use client';

/**
 * LooksRail — "Looks to shop" module band. Port of the mobile
 * HomeLookBreak interruption: a quiet shelf of tall look tiles injected
 * between feed chunks so the grid doesn't read as a flat catalogue.
 * Tiles deep-link to /look/[id]; the media carries the identity
 * (creator + tagged count over a legibility scrim), same grammar as
 * the LookTile feed unit.
 */

import Link from 'next/link';
import { LOOKS, userById } from '@/lib/data/fixtures';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ModuleSection } from './ModuleSection';
import { Rail } from './Rail';

export function LooksRail() {
  if (LOOKS.length === 0) return null;
  return (
    <ModuleSection title="Looks to shop">
      <Rail label="Looks to shop">
        {LOOKS.map((look) => {
          const creator = userById(look.creatorId);
          return (
            <Link
              key={look.id}
              href={`/look/${look.id}`}
              role="listitem"
              aria-label={`Open look${look.title ? ` ${look.title}` : ''} by @${creator?.username ?? 'member'}, ${look.itemIds.length} tagged items`}
              className="pressable group block w-[128px] shrink-0 snap-start sm:w-[160px]"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-alt">
                <AppImage
                  src={look.coverImageUri}
                  alt={look.title ?? 'Look'}
                  fill
                  sizes="160px"
                  className="h-full w-full transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim to-transparent px-2.5 pb-2 pt-8">
                  <div className="flex items-center gap-1.5">
                    {creator ? (
                      <Avatar src={creator.avatar} name={creator.username} size={20} />
                    ) : null}
                    <span className="clamp-1 text-caption font-medium text-scrim-text-primary">
                      {creator ? `@${creator.username}` : 'Look'}
                    </span>
                    <span className="ml-auto flex items-center gap-1 text-meta text-scrim-text-secondary">
                      <Icon name="pricetag" size={12} />
                      {look.itemIds.length}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </Rail>
    </ModuleSection>
  );
}

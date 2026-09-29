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
import { DATA_MODE } from '@/lib/api/client';
import { LOOKS, userById } from '@/lib/data/fixtures';
import { useLooksRail } from '@/lib/hooks/home-modules';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ModuleSection } from './ModuleSection';
import { Rail } from './Rail';

const LIVE = DATA_MODE === 'live';

interface LookRailRow {
  id: string;
  title?: string | null;
  coverImageUri: string;
  username: string | null;
  avatar: string | null;
  taggedCount: number;
}

export function LooksRail() {
  const live = useLooksRail();
  // Live rows carry the creator object; fixtures resolve the id.
  const looks: LookRailRow[] = LIVE
    ? live.looks.map((look) => ({
        id: look.id,
        title: look.title,
        coverImageUri: look.coverImageUri,
        username: look.creator?.username ?? null,
        avatar: look.creator?.avatar ?? null,
        taggedCount: look.itemIds.length,
      }))
    : LOOKS.map((look) => {
        const creator = userById(look.creatorId);
        return {
          id: look.id,
          title: look.title,
          coverImageUri: look.coverImageUri,
          username: creator?.username ?? null,
          avatar: creator?.avatar ?? null,
          taggedCount: look.itemIds.length,
        };
      });
  // Live mode: no published looks (or still loading) → the band omits.
  if (looks.length === 0) return null;
  return (
    <ModuleSection title="Looks to shop" moduleId="looks">
      <Rail label="Looks to shop">
        {looks.map((look) => {
          const { username, avatar, taggedCount } = look;
          return (
            <Link
              key={look.id}
              href={`/look/${look.id}`}
              role="listitem"
              aria-label={`Open look${look.title ? ` ${look.title}` : ''} by @${username ?? 'member'}, ${taggedCount} tagged items`}
              className="pressable group block w-[128px] shrink-0 snap-start sm:w-[160px]"
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-alt">
                <AppImage
                  src={look.coverImageUri}
                  alt={look.title ?? 'Look'}
                  fill
                  sizes="160px"
                  className="h-full w-full media-zoom"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim to-transparent px-2.5 pb-2 pt-8">
                  <div className="flex items-center gap-1.5">
                    {avatar ? (
                      <Avatar src={avatar} name={username ?? 'member'} size={20} />
                    ) : null}
                    <span className="clamp-1 text-caption font-medium text-scrim-text-primary">
                      {username ? `@${username}` : 'Look'}
                    </span>
                    {taggedCount > 0 ? (
                      <span className="ml-auto flex items-center gap-1 text-meta text-scrim-text-secondary">
                        <Icon name="pricetag" size={12} />
                        {taggedCount}
                      </span>
                    ) : null}
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

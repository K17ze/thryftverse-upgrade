'use client';

/**
 * Authored feed units — Look, Poster, Moodboard, Editorial tiles and the
 * recommendation break. Media is the label; quiet overlay captions only
 * where the content needs identity (mirrors the mobile unit renderers).
 */

import Link from 'next/link';
import type {
  LookFeedUnit,
  PosterFeedUnit,
  MoodboardFeedUnit,
  EditorialFeedUnit,
  RecommendationBreakFeedUnit,
} from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { ProductTile } from '@/components/cards/ProductTile';

/** Unauthored editorial units default to this cinematic ratio — the
 *  tile render and the masonry distributor must share the same value or
 *  the column heights lie. */
export const DEFAULT_EDITORIAL_ASPECT_RATIO = 1.9;

/**
 * Content-type badge — the glanceable unit identifier (Instagram's
 * documented micro-badge fix). A clearly contrasted scrim chip holding a
 * ≥14px glyph, pinned top-right so it never collides with the identity
 * overlays each unit already owns. At a scan, look ≠ poster ≠ board.
 */
function UnitTypeChip({ icon, label }: { icon: AppIconName; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-overlay text-scrim-text-primary"
    >
      <Icon name={icon} size={15} />
    </span>
  );
}

export function LookTile({ unit, priority }: { unit: LookFeedUnit; priority?: boolean }) {
  return (
    <Link href={`/look/${unit.lookId}`} className="pressable group block" aria-label="Open look">
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={unit.coverImageUri}
          alt="Look"
          aspectRatio={unit.coverAspectRatio ?? 0.75}
          sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, (max-width: 1200px) 25vw, (max-width: 1600px) 20vw, 15vw"
          priority={priority}
          className="media-zoom"
        />
        <UnitTypeChip icon="layers" label="Look" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim to-transparent px-2.5 pb-2 pt-8">
          <div className="flex items-center gap-1.5">
            {unit.creatorAvatarUri ? (
              <Avatar src={unit.creatorAvatarUri} name={unit.creatorUsername} size={20} />
            ) : null}
            <span className="clamp-1 text-caption font-medium text-scrim-text-primary">
              {unit.creatorUsername ? `@${unit.creatorUsername}` : 'Look'}
            </span>
            {unit.itemCount ? (
              <span className="ml-auto flex items-center gap-1 text-meta text-scrim-text-secondary">
                <Icon name="pricetag" size={12} />
                {unit.itemCount}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function PosterTile({ unit, priority }: { unit: PosterFeedUnit; priority?: boolean }) {
  return (
    <Link href={`/poster/${unit.storyId}`} className="pressable group block" aria-label="Open poster story">
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={unit.coverUri}
          alt="Poster"
          aspectRatio={unit.aspectRatio ?? 0.75}
          sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, (max-width: 1200px) 25vw, (max-width: 1600px) 20vw, 15vw"
          priority={priority}
          className="media-zoom"
        />
        <UnitTypeChip icon="play" label="Poster story" />
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          {unit.authorAvatarUri ? (
            <Avatar src={unit.authorAvatarUri} name={unit.authorUsername} size={20} ring />
          ) : null}
          <span className="text-caption font-medium text-scrim-text-primary drop-scrim">
            {unit.authorUsername ? `@${unit.authorUsername}` : ''}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function MoodboardTile({ unit, priority }: { unit: MoodboardFeedUnit; priority?: boolean }) {
  return (
    <Link href={`/moodboard/${unit.moodboardId}`} className="pressable group block" aria-label={`Open moodboard ${unit.title ?? ''}`}>
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={unit.coverUri}
          alt={unit.title ?? 'Moodboard'}
          aspectRatio={unit.aspectRatio ?? 0.8}
          sizes="(max-width: 480px) 50vw, (max-width: 768px) 33vw, (max-width: 1200px) 25vw, (max-width: 1600px) 20vw, 15vw"
          priority={priority}
          className="media-zoom"
        />
        <UnitTypeChip icon="images" label="Moodboard" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim to-transparent px-2.5 pb-2 pt-8">
          <span className="clamp-1 text-caption font-semibold text-scrim-text-primary">
            {unit.title ?? 'Moodboard'}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function EditorialTile({ unit, priority }: { unit: EditorialFeedUnit; priority?: boolean }) {
  const inner = (
    <div className="relative overflow-hidden rounded-xl bg-surface-alt">
      <AppImage
        src={unit.mediaUri}
        alt={unit.headline ?? 'Editorial'}
        aspectRatio={unit.aspectRatio ?? DEFAULT_EDITORIAL_ASPECT_RATIO}
        sizes="(max-width: 640px) 100vw, 90vw"
        priority={priority}
        className="media-zoom"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim to-transparent px-5 pb-4 pt-12">
        {unit.kicker ? (
          <span className="text-label text-scrim-text-secondary">
            {unit.kicker}
          </span>
        ) : null}
        {unit.headline ? (
          <h3 className="clamp-2 mt-1 text-editorial-title text-scrim-text-primary">
            {unit.headline}
          </h3>
        ) : null}
      </div>
    </div>
  );
  return unit.href ? (
    <Link href={unit.href} className="pressable group block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/**
 * RecommendationBreak — a quiet "more like this" strip, always rendered
 * full-bleed (MasonryGrid force-spans it). Flat-canvas grammar: hairline
 * top, section title, media-only tiles — the same band chrome as the
 * home modules, not a card.
 */
export function RecommendationBreak({ unit }: { unit: RecommendationBreakFeedUnit }) {
  if (unit.listings.length === 0) return null;
  return (
    <section
      aria-label={unit.headline}
      className="border-t border-border-subtle px-2.5 py-5 sm:px-4 sm:py-6"
    >
      <h3 className="mb-3 text-section-title font-semibold text-text-primary">
        {unit.headline}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-2">
        {unit.listings.slice(0, 6).map((l) => (
          <ProductTile key={l.id} item={l} visualOnly />
        ))}
      </div>
    </section>
  );
}

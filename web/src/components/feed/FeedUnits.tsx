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
      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-scrim-text-primary"
    >
      <Icon name={icon} size={15} />
    </span>
  );
}

export function LookTile({ unit }: { unit: LookFeedUnit }) {
  return (
    <Link href={`/look/${unit.lookId}`} className="group block" aria-label="Open look">
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={unit.coverImageUri}
          alt="Look"
          aspectRatio={unit.coverAspectRatio ?? 0.75}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
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

export function PosterTile({ unit }: { unit: PosterFeedUnit }) {
  return (
    <Link href={`/poster/${unit.storyId}`} className="group block" aria-label="Open poster story">
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={unit.coverUri}
          alt="Poster"
          aspectRatio={unit.aspectRatio ?? 0.75}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
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

export function MoodboardTile({ unit }: { unit: MoodboardFeedUnit }) {
  return (
    <Link href={`/moodboard/${unit.moodboardId}`} className="group block" aria-label={`Open moodboard ${unit.title ?? ''}`}>
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={unit.coverUri}
          alt={unit.title ?? 'Moodboard'}
          aspectRatio={unit.aspectRatio ?? 0.8}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
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

export function EditorialTile({ unit }: { unit: EditorialFeedUnit }) {
  const inner = (
    <div className="relative overflow-hidden rounded-xl bg-surface-alt">
      <AppImage
        src={unit.mediaUri}
        alt={unit.headline ?? 'Editorial'}
        aspectRatio={unit.aspectRatio ?? 1.9}
        sizes="(max-width: 640px) 100vw, 90vw"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-media-overlay-scrim to-transparent px-5 pb-4 pt-12">
        {unit.kicker ? (
          <span className="text-label font-semibold uppercase tracking-wider text-scrim-text-secondary">
            {unit.kicker}
          </span>
        ) : null}
        {unit.headline ? (
          <h3 className="mt-1 text-editorial-title text-scrim-text-primary">
            {unit.headline}
          </h3>
        ) : null}
      </div>
    </div>
  );
  return unit.href ? (
    <Link href={unit.href} className="group block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function RecommendationBreak({ unit }: { unit: RecommendationBreakFeedUnit }) {
  return (
    <section className="rounded-xl bg-surface px-4 py-5">
      <h3 className="text-section-title font-semibold text-text-primary">{unit.headline}</h3>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {unit.listings.slice(0, 6).map((l) => (
          <ProductTile key={l.id} item={l} visualOnly />
        ))}
      </div>
    </section>
  );
}

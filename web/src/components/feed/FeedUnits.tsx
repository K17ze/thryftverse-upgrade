'use client';

/**
 * Authored feed units — Look, Poster, Moodboard, Editorial tiles and the
 * recommendation break. Media is the label; quiet overlay captions only
 * where the content needs identity (mirrors the mobile unit renderers).
 */

import Link from 'next/link';
import type { MouseEvent } from 'react';
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
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';

/** Unauthored editorial units default to this cinematic ratio — the
 *  tile render and the masonry distributor must share the same value or
 *  the column heights lie. */
export const DEFAULT_EDITORIAL_ASPECT_RATIO = 1.9;

/**
 * Content-type badge — the glanceable unit identifier (Instagram's
 * documented micro-badge fix). A bare glyph pinned top-right so it never
 * collides with the identity overlays each unit already owns — `drop-scrim`
 * for legibility over media, no containing circle (the same bare/scrim-only
 * affordance grammar as the tile's save and dismiss glyphs). At a scan,
 * look ≠ poster ≠ board.
 */
function UnitTypeChip({ icon, label }: { icon: AppIconName; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center text-scrim-text-primary"
    >
      <Icon name={icon} size={17} className="drop-scrim" />
    </span>
  );
}

export function LookTile({ unit, priority }: { unit: LookFeedUnit; priority?: boolean }) {
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const hydrated = useHydrated();
  const savedLook = useStore((s) => s.savedLooks.includes(unit.lookId));
  const toggleSavedLook = useStore((s) => s.toggleSavedLook);
  const saved = hydrated && savedLook;

  const handleSave = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth('save_item')) return;
    const removing = saved;
    // Optimistic + revert lives in the store (writeThroughLook); the
    // boolean result decides between confirmation and rollback copy —
    // same honesty grammar as the listing tile's saved/wishlist buttons.
    void toggleSavedLook(unit.lookId).then((ok) => {
      show(
        ok
          ? removing
            ? 'Removed from saved'
            : 'Look saved'
          : 'Couldn’t sync — saved looks restored',
        ok ? 'info' : 'error',
      );
    });
  };

  return (
    // Stretched-link grammar (same as ProductTile): the media box is the
    // only in-flow node, so the tile height stays pure aspect math and
    // the masonry distributor needs no observer for this unit.
    <div className="group relative pressable">
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={unit.coverImageUri}
          alt="Look"
          aspectRatio={unit.coverAspectRatio ?? 0.75}
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, (max-width: 1536px) 20vw, 16vw"
          priority={priority}
          className="media-zoom"
        />
        {/* Quick save — look saves are a real edge (savedLooks →
            /looks/:id/save), so the hover affordance writes honestly.
            Posters, boards and editorials have no save contract on this
            stack, so those units stay media-only rather than fake one.
            Sits left of the type chip at the same optical centre. */}
        <button
          type="button"
          onClick={handleSave}
          aria-label={saved ? 'Remove look from saved' : 'Save look'}
          aria-pressed={saved}
          className="quick-actions pressable absolute right-10 top-0 z-elevated flex h-11 w-11 items-center justify-center transition-opacity"
        >
          <Icon
            name="bookmark"
            filled={saved}
            size={20}
            className={saved ? 'text-brand drop-scrim' : 'text-scrim-text-primary drop-scrim'}
          />
        </button>
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
      <Link
        href={`/look/${unit.lookId}`}
        className="absolute inset-0 z-[1] rounded-lg"
        aria-label={`Open look${unit.creatorUsername ? ` by @${unit.creatorUsername}` : ''}`}
      />
    </div>
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
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, (max-width: 1536px) 20vw, 16vw"
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
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, (max-width: 1536px) 20vw, 16vw"
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

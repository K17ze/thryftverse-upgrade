/**
 * Discovery Feed Assembly — `Listing[]` → heterogeneous `DiscoveryFeedUnit[]`.
 *
 * This is the layer that makes Discovery a visual-discovery canvas instead of
 * a 2-column catalogue. It is the single place where feed-unit rhythm and
 * span decisions are made for the Discover tab, so the renderer
 * (PinterestMasonryGrid) stays a pure function of `DiscoveryFeedUnit[]`.
 *
 * Truthful-UI constraints (AGENTS.md §11, discoveryFeedUnit.ts):
 *  - Editorial / look / poster units are NEVER invented here. They render
 *    only when the backend sends valid data. The client never fabricates
 *    editorial media or a fake inclusion reason.
 *  - `recommendation_break` is used only as a literal content-type heading
 *    immediately before real units ("Looks", "Moodboards", "Pulse").
 *  - Hero spans are art direction over REAL media geometry: a listing with a
 *    landscape media aspect (≥1.2) may span both columns. No fabricated
 *    imagery, no fake aspect ratios.
 *
 * Stability across pagination: hero eligibility is per-listing and creator
 * chapters are distributed from actual chapter availability + feed length.
 */

import type { Listing } from '../domain';
import {
  buildListingFeedUnit,
  type DiscoveryFeedUnit,
  type LookFeedUnit,
  type MoodboardFeedUnit,
  type PosterFeedUnit,
  type ListingFeedUnit,
  type RecommendationBreakFeedUnit,
} from '../contracts/discoveryFeedUnit';
import type { LookApiItem } from '../services/looksApi';
import type { PosterStory } from '../services/postersApi';
import type { Moodboard } from '../services/moodboardApi';
import { resolveListingMediaAspectRatio } from './listingMediaGeometry';
import { getListingCoverUri, isVideoUri } from '../utils/media';

/**
 * Aspect ratio at or above which a listing's real media is considered
 * landscape enough to anchor a full-width hero row. Below this, the listing
 * stays a single-column masonry tile (portrait/square media reads better in a
 * narrow column than stretched across two).
 */
const HERO_ASPECT_THRESHOLD = 1.2;

/**
 * Minimum number of single-column listings between hero rows, so heroes
 * remain a deliberate rhythm break rather than dominating the feed.
 */
const HERO_MIN_GAP = 8;

export interface DiscoverySupplementalContent {
  /** Published, server-ranked Looks. */
  looks?: LookApiItem[];
  /** Active public Poster stories. */
  posters?: PosterStory[];
  /** Public, backend-owned Moodboards. Demo rows are rejected below. */
  moodboards?: Moodboard[];
}

/**
 * Assemble a heterogeneous discovery feed from a list of marketplace
 * listings. Landscape-media listings may become full-width anchors. Real
 * creator chapters are distributed evenly through the available listing
 * feed; no empty or invented recommendation sections are emitted.
 *
 * @param listings  The raw marketplace listings (cached or fresh).
 * @param numColumns  The masonry column count (used to set full-width spans).
 */
export function assembleDiscoveryFeed(
  listings: Listing[],
  numColumns = 2,
  supplemental: DiscoverySupplementalContent = {},
): DiscoveryFeedUnit[] {
  const looks = buildLookUnits(supplemental.looks ?? []);
  const posters = buildPosterUnits(supplemental.posters ?? []);
  const moodboards = buildMoodboardUnits(supplemental.moodboards ?? [], numColumns);

  const chapters = buildCreatorChapters(looks, posters, moodboards, numColumns);
  if (listings.length === 0) return chapters.flat();

  const listingUnits: ListingFeedUnit[] = [];
  let listingsSinceHero = HERO_MIN_GAP; // allow the first eligible listing to be a hero

  listings.forEach((listing) => {
    const aspectRatio = resolveListingMediaAspectRatio(listing);
    const isLandscape = aspectRatio >= HERO_ASPECT_THRESHOLD;
    const canBeHero = isLandscape && listingsSinceHero >= HERO_MIN_GAP;

    const unit = buildListingFeedUnit(
      listing,
      // Use getListingCoverUri to always pick an image (not a video) for the
      // tile's primary media. ExpoImage cannot render video URIs, so passing
      // a video here would show a broken tile. Video playback in feed is
      // handled by the full ProductCard, not the lightweight discovery tile.
      getListingCoverUri(listing.images ?? [], ''),
      aspectRatio,
      listing.isSold ? 'sold' : undefined,
    );

    if (canBeHero) {
      unit.span = numColumns;
      listingsSinceHero = 0;
    } else {
      listingsSinceHero += 1;
    }

    listingUnits.push(unit);
  });

  if (chapters.length === 0) return listingUnits;

  // Content-aware cadence: distribute only the chapters that actually exist
  // across the current feed length. A chapter waits one position when its
  // target follows a full-width media hero, preserving a clean silhouette.
  const targets = chapters.map((_, index) => (
    Math.max(1, Math.round(((index + 1) * listingUnits.length) / (chapters.length + 1)))
  ));
  const units: DiscoveryFeedUnit[] = [];
  let chapterIndex = 0;
  listingUnits.forEach((unit, index) => {
    units.push(unit);
    if (chapterIndex >= chapters.length) return;
    const target = targets[chapterIndex];
    const followedHero = (unit.span ?? 1) >= numColumns;
    const isFinalListing = index === listingUnits.length - 1;
    if (index + 1 >= target && (!followedHero || isFinalListing)) {
      units.push(...chapters[chapterIndex]);
      chapterIndex += 1;
    }
  });
  while (chapterIndex < chapters.length) {
    units.push(...chapters[chapterIndex]);
    chapterIndex += 1;
  }
  return units;
}

function buildLookUnits(looks: LookApiItem[]): LookFeedUnit[] {
  return looks
    .filter((look) => (
      look.status === 'published'
      && look.visibility === 'public'
      && look.mediaUrl.trim().length > 0
      && look.mediaType !== 'video'
      && !isVideoUri(look.mediaUrl)
    ))
    .slice(0, 4)
    .map((look) => ({
      id: `look:${look.id}`,
      type: 'look' as const,
      look,
      title: look.title || look.caption || 'Look',
      coverImageUri: look.mediaUrl,
      aspectRatio: 4 / 5,
      itemIds: look.tags.flatMap((tag) => tag.listingId ? [tag.listingId] : []),
    }));
}

function buildPosterUnits(posters: PosterStory[]): PosterFeedUnit[] {
  return posters
    .filter((story) => story.status === 'active' && story.audience === 'public')
    .flatMap((story): PosterFeedUnit[] => {
      const coverFrame = story.frames.find((frame) => (
        frame.mediaType === 'image' && frame.mediaUrl.trim().length > 0
      ));
      if (!coverFrame) return [];
      return [{
        id: `poster:${story.id}`,
        type: 'poster',
        story,
        coverUri: coverFrame.mediaUrl,
        aspectRatio: 9 / 16,
      }];
    })
    .slice(0, 4);
}

function buildMoodboardUnits(moodboards: Moodboard[], numColumns: number): MoodboardFeedUnit[] {
  return moodboards
    .filter((moodboard) => (
      moodboard.isPublic
      && !moodboard.isDemo
      && moodboard.coverImage.trim().length > 0
      && moodboard.items.length > 0
    ))
    .slice(0, 2)
    .map((moodboard) => ({
      id: `moodboard:${moodboard.id}`,
      type: 'moodboard' as const,
      moodboard,
      coverUri: moodboard.coverImage,
      aspectRatio: 16 / 10,
      span: numColumns,
    }));
}

function buildCreatorChapters(
  looks: LookFeedUnit[],
  posters: PosterFeedUnit[],
  moodboards: MoodboardFeedUnit[],
  numColumns: number,
): DiscoveryFeedUnit[][] {
  const chapters: DiscoveryFeedUnit[][] = [];
  if (looks.length > 0) {
    chapters.push([buildContentBreak('Looks', 'looks', numColumns), ...looks.slice(0, 2)]);
  }
  if (moodboards.length > 0) {
    chapters.push([buildContentBreak('Moodboards', 'moodboards', numColumns), moodboards[0]]);
  }
  if (posters.length > 0) {
    chapters.push([buildContentBreak('Pulse', 'posters', numColumns), ...posters.slice(0, 2)]);
  }
  return chapters;
}

function buildContentBreak(
  label: string,
  id: string,
  numColumns: number,
): RecommendationBreakFeedUnit {
  return {
    id: `break:${id}`,
    type: 'recommendation_break',
    label,
    span: numColumns,
  };
}

/**
 * Narrow a `DiscoveryFeedUnit` to its `ListingFeedUnit` variant, or null.
 * Used by the renderer to recover the listing payload for listing tiles.
 */
export function asListingUnit(
  unit: DiscoveryFeedUnit,
): ListingFeedUnit | null {
  return unit.type === 'listing' ? (unit as ListingFeedUnit) : null;
}

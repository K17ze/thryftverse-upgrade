/**
 * Discovery Feed-Unit Contract — Thryftverse Home / Discovery / Search
 *
 * Canonical typed contract for every unit that can appear in a discovery
 * feed. The server decides eligible units; the client never invents
 * editorial media (audit §02 — Canonical feed-unit contract).
 *
 * Principles:
 * - Server-driven: editorial units must come from the backend with a
 *   `source: 'server'` discriminator. The client renders `null` for
 *   unavailable editorial modules — never empty-URI shells.
 * - One masonry implementation: all units flow through the same grid
 *   renderer (PinterestMasonryGrid / FlashList) so there is one
 *   performance path, not parallel grid components.
 * - Product tile metadata budget: media + title/brand (one line) + price +
 *   optional state marker (one). No stacking price + old price + discount +
 *   likes + seller + badge + shipping + AI reason + availability.
 * - Video visibility playback: poster frame before playback; autoplay only
 *   when sufficiently visible; muted; pause when offscreen/backgrounded.
 *
 * This contract is the single source of truth for feed unit shapes. New
 * unit types must be added here before they can be rendered.
 */

import type { DiscoveryListingSummary, ListingLike } from './DiscoveryListingSummary';
import { mapListingToDiscoverySummary } from './DiscoveryListingSummary';
import type { PosterStory } from '../services/postersApi';

// ============================================================================
// FEED UNIT DISCRIMINATED UNION
// ============================================================================

export type DiscoveryFeedUnitType =
  | 'listing'
  | 'look'
  | 'poster'
  | 'editorial'
  | 'recommendation_break';

/**
 * Base shape shared by all feed units. Every unit has a stable id and a
 * type discriminator so the renderer can switch on type without fragile
 * duck-typing.
 */
export interface DiscoveryFeedUnitBase {
  /** Stable unique id for keying and virtualization. */
  id: string;
  /** Discriminator — determines which tile renderer is used. */
  type: DiscoveryFeedUnitType;
  /** Server ranking score (higher = earlier). Client may re-rank locally. */
  score?: number;
  /** Optional reason for inclusion (shown only in debug/overflow, never on every card). */
  reason?: string;
}

/**
 * A marketplace listing tile.
 * Metadata budget: media + title/brand (one line) + price + one state marker.
 */
export interface ListingFeedUnit extends DiscoveryFeedUnitBase {
  type: 'listing';
  listing: DiscoveryListingSummary;
  /** Media URI for the primary image/video. */
  mediaUri: string;
  /** Poster frame for video (undefined for image). */
  posterUri?: string;
  /** Aspect ratio (width / height) — reserved before media loads to prevent reflow. */
  aspectRatio: number;
  /** At most one state marker (auction/co-own/sold). */
  stateMarker?: 'auction' | 'co-own' | 'sold';
}

/**
 * A look (outfit/curated collection) tile.
 */
export interface LookFeedUnit extends DiscoveryFeedUnitBase {
  type: 'look';
  title: string;
  coverImageUri: string;
  aspectRatio: number;
  itemIds: string[];
}

/**
 * A poster story tile (creator content).
 */
export interface PosterFeedUnit extends DiscoveryFeedUnitBase {
  type: 'poster';
  story: PosterStory;
  /** Cover media URI (first frame or composition thumbnail). */
  coverUri: string;
  aspectRatio: number;
}

/**
 * A server-driven editorial module. The client never invents editorial
 * media — `source` must be `'server'` and `mediaUri` must be a usable URI.
 * If the backend sends an empty/invalid URI, the renderer returns `null`.
 */
export interface EditorialFeedUnit extends DiscoveryFeedUnitBase {
  type: 'editorial';
  source: 'server';
  title: string;
  kicker?: string;
  mediaUri: string;
  aspectRatio: number;
  /** Deep-link destination (route name + params). */
  destination?: {
    route: string;
    params?: Record<string, string | number | boolean>;
  };
}

/**
 * A recommendation break — a thin separator that explains why a new
 * section of recommendations follows (e.g. "Because you saved…").
 * Shown as a quiet eyebrow, not a full card.
 */
export interface RecommendationBreakFeedUnit extends DiscoveryFeedUnitBase {
  type: 'recommendation_break';
  label: string;
}

export type DiscoveryFeedUnit =
  | ListingFeedUnit
  | LookFeedUnit
  | PosterFeedUnit
  | EditorialFeedUnit
  | RecommendationBreakFeedUnit;

// ============================================================================
// LISTING FEED-UNIT BUILDER
// ============================================================================

/**
 * Builds a `ListingFeedUnit` from any listing-like source (mock-data
 * `Listing` or backend listing payload). The source is mapped through the
 * production `DiscoveryListingSummary` contract so the feed unit never
 * carries a raw mock-data type.
 *
 * @param source  Any listing-like object.
 * @param mediaUri  Primary media URI for the tile.
 * @param aspectRatio  Reserved aspect ratio (width / height).
 * @param stateMarker  Optional single state marker (auction/co-own/sold).
 */
export function buildListingFeedUnit(
  source: ListingLike,
  mediaUri: string,
  aspectRatio: number,
  stateMarker?: ListingFeedUnit['stateMarker'],
): ListingFeedUnit {
  return {
    id: `listing:${source.id}`,
    type: 'listing',
    listing: mapListingToDiscoverySummary(source),
    mediaUri,
    aspectRatio,
    stateMarker,
  };
}

// ============================================================================
// PRODUCT TILE METADATA BUDGET
// ============================================================================

/**
 * The maximum metadata allowed on a product tile (audit §02).
 *
 * Default tile shows:
 *   1. media
 *   2. title/brand (one restrained line)
 *   3. price
 *   4. optional state marker (auction/co-own/sold) — ONE only
 *
 * Do NOT stack: price + old price + discount + likes + seller + badge +
 * shipping + AI reason + availability all below every image.
 */
export const PRODUCT_TILE_METADATA_BUDGET = {
  /** Maximum number of text lines below the image. */
  maxTextLines: 3,
  /** Maximum number of badges/overlays on the media. */
  maxMediaBadges: 2,
  /** Maximum number of state markers (auction/co-own/sold). */
  maxStateMarkers: 1,
  /** Seller row is optional and must not include likes + shipping + reason. */
  sellerRowAllowed: true,
  /** Old price / discount is allowed only on PDP, not on every tile. */
  priceHistoryOnTile: false,
  /** AI reason is never shown on the tile — only in overflow/help. */
  aiReasonOnTile: false,
} as const;

// ============================================================================
// VIDEO VISIBILITY PLAYBACK CONTRACT
// ============================================================================

/**
 * Video in feed (audit §02):
 * - poster frame before playback
 * - autoplay only when sufficiently visible
 * - muted
 * - pause when offscreen/backgrounded
 * - no native video-control chrome in tiny feed cards
 * - respect reduced motion / data saver
 * - remember playback position only if product semantics need it
 */
export const VIDEO_PLAYBACK_CONTRACT = {
  /** Minimum viewability fraction to trigger autoplay. */
  autoplayViewabilityFraction: 0.6,
  /** Settlement delay (ms) before autoplay fires — avoids spinning up players during fast scroll. */
  autoplaySettlementDelayMs: 350,
  /** Always muted in feed. */
  muted: true,
  /** Always looped in feed. */
  loop: true,
  /** Pause immediately when offscreen. */
  pauseOffscreen: true,
  /** Pause when app is backgrounded. */
  pauseOnBackground: true,
  /** No native video-control chrome in feed cards. */
  showNativeControls: false,
  /** Respect reduced motion — show poster frame only. */
  respectReducedMotion: true,
} as const;

// ============================================================================
// SERVER-DRIVEN EDITORIAL SCHEMA
// ============================================================================

/**
 * Server-driven editorial schema for search/discovery landing.
 * The client renders `null` for any editorial module whose `mediaUri`
 * is empty/invalid — never an empty-URI shell (audit §02).
 */
export interface ServerEditorialModule {
  id: string;
  type: 'editorial_card' | 'editorial_rail' | 'editorial_hero';
  source: 'server';
  title: string;
  kicker?: string;
  /** Must be a usable URI. Empty/invalid → renderer returns null. */
  mediaUri: string;
  /** Aspect ratio for the editorial media. */
  aspectRatio: number;
  /** Deep-link destination. */
  destination?: {
    route: string;
    params?: Record<string, string | number | boolean>;
  };
  /** Server ranking — higher = earlier. */
  rank?: number;
}

/**
 * Validates a ServerEditorialModule. Returns false if the module should
 * not be rendered (empty URI, missing required fields).
 */
export function isValidEditorialModule(module: ServerEditorialModule): boolean {
  if (!module.id || !module.title) return false;
  if (typeof module.mediaUri !== 'string' || module.mediaUri.trim().length === 0) return false;
  if (!module.aspectRatio || module.aspectRatio <= 0) return false;
  return true;
}

/**
 * Filters an array of server editorial modules, dropping any that fail
 * validation. The client never renders empty-URI shells.
 */
export function filterValidEditorialModules(modules: ServerEditorialModule[]): ServerEditorialModule[] {
  return modules.filter(isValidEditorialModule);
}

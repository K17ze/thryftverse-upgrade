'use client';

/**
 * Feed preference state — the local mirror of the feed controls
 * ("Not interested" hides, "Show less like this" facet down-weights).
 *
 * Mirrors the mobile feed-controls semantics:
 *  - Signed-in + live mode: the same choices are written to the backend
 *    (/interactions + intent ledger) — this store is the immediate local
 *    reflection so the feed updates before the next serve.
 *  - Guest or fixture mode: the choice is a real device-local control —
 *    persisted to localStorage, honest copy says "on this device".
 *  - Undo restores via `unhideListing` (+ the intent `usual` write in live).
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DiscoveryListingSummary } from '@/lib/contracts/domain';

/** The "Not interested" follow-up reason — the same vocabulary the mobile
 *  feedback loop and the backend interaction metadata use. */
export type NotInterestedReason =
  | 'not_my_style'
  | 'wrong_size'
  | 'seen_it'
  | 'too_expensive';

export const NOT_INTERESTED_REASONS: {
  value: NotInterestedReason;
  label: string;
  /** What the choice does to the feed — stated honestly on the row. */
  effect: string;
}[] = [
  { value: 'not_my_style', label: 'Not my style', effect: 'Fewer pieces from this look' },
  { value: 'wrong_size', label: 'Not my size', effect: 'Fewer items in this size' },
  { value: 'seen_it', label: 'Seen it already', effect: 'Only this item is hidden' },
  { value: 'too_expensive', label: 'Too expensive', effect: 'Fewer items priced above it' },
];

/** A category-scoped size dampen — "Not my size" on a pair of W32 jeans
 *  shouldn't mute W32 footwear, so the pair is always category-bound. */
export interface SizeDownweight {
  category: string;
  size: string;
}

/** A category-scoped price ceiling — "Too expensive" demotes same-category
 *  items priced at or above the flagged item's price. */
export interface PriceCeiling {
  category: string;
  maxPrice: number;
}

// ── Module fatigue (Pinterest Module Relevance parity) ──────────────────
// Home-feed module bands (entry band, rails, editorial banner) carry a
// stable id. Two suppression channels, both honest:
//  - explicit: the user dismissed the band → it never re-appears (Undo on
//    the confirmation toast restores it);
//  - implicit: the band has rendered into view this many times without a
//    single engagement (a click on its content) → it fatigues out. An
//    impression only counts when the band actually intersects the
//    viewport — a module below the fold the user never reached is not a
//    view.
export const MODULE_FATIGUE_IMPRESSIONS = 8;

/** Suppression check for one module id — explicit dismiss wins, then the
 *  never-engaged fatigue threshold. */
export function moduleSuppressed(
  state: {
    dismissedModuleIds: readonly string[];
    moduleImpressions: Record<string, number>;
    moduleEngagements: Record<string, number>;
  },
  id: string,
): boolean {
  if (state.dismissedModuleIds.includes(id)) return true;
  return (
    (state.moduleImpressions[id] ?? 0) >= MODULE_FATIGUE_IMPRESSIONS &&
    (state.moduleEngagements[id] ?? 0) === 0
  );
}

interface FeedPrefsState {
  /** Listing ids hidden by "Not interested". */
  hiddenListingIds: string[];
  /** Lowercase facet keys (category/brand words) the user asked to see
   *  fewer of — consumed by the local ranking layer as a penalty. */
  downweightedKeys: string[];
  /** Latest reason per hidden listing — record of the follow-up choice. */
  notInterestedReasons: Record<string, NotInterestedReason>;
  /** Category+size pairs demoted by "Not my size" feedback. */
  downweightedSizes: SizeDownweight[];
  /** Per-category price ceilings from "Too expensive" feedback. */
  priceCeilings: PriceCeiling[];
  /** Home module bands the user dismissed — the module never re-appears. */
  dismissedModuleIds: string[];
  /** In-viewport impressions per module id — feeds the fatigue check. */
  moduleImpressions: Record<string, number>;
  /** Real content engagements per module id — one resets fatigue. */
  moduleEngagements: Record<string, number>;
  hideListing: (id: string) => void;
  unhideListing: (id: string) => void;
  downweightKey: (key: string) => void;
  /** Lift a previous facet down-weight — the local mirror of the ledger's
   *  latest-mutation-wins reversal ("See more like this" supersedes an
   *  earlier "Show less" on the same facet). */
  unDownweightKey: (key: string) => void;
  /** Record the follow-up reason and apply its real facet dampen. The
   *  listing is already hidden by `hideListing` — this is the "dampen
   *  similar items" half of the feedback loop. */
  applyNotInterestedReason: (
    listing: DiscoveryListingSummary,
    reason: NotInterestedReason,
  ) => void;
  /** Explicit module dismissal — the band stops rendering (undo restores). */
  dismissModule: (id: string) => void;
  undismissModule: (id: string) => void;
  /** The module actually scrolled into view — one count per mount. */
  noteModuleImpression: (id: string) => void;
  /** The user engaged with module content — keeps the band alive. */
  noteModuleEngagement: (id: string) => void;
}

const cleanSizes = (raw: unknown): SizeDownweight[] =>
  (Array.isArray(raw) ? raw : []).filter(
    (x): x is SizeDownweight =>
      !!x &&
      typeof x === 'object' &&
      typeof (x as SizeDownweight).category === 'string' &&
      typeof (x as SizeDownweight).size === 'string',
  );

const cleanCeilings = (raw: unknown): PriceCeiling[] =>
  (Array.isArray(raw) ? raw : []).filter(
    (x): x is PriceCeiling =>
      !!x &&
      typeof x === 'object' &&
      typeof (x as PriceCeiling).category === 'string' &&
      typeof (x as PriceCeiling).maxPrice === 'number',
  );

const cleanReasons = (raw: unknown): Record<string, NotInterestedReason> => {
  const valid = new Set(NOT_INTERESTED_REASONS.map((r) => r.value));
  const out: Record<string, NotInterestedReason> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, string>)) {
      if (valid.has(v as NotInterestedReason)) out[k] = v as NotInterestedReason;
    }
  }
  return out;
};

const cleanStringArray = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw : []).filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );

const cleanCountMap = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
    }
  }
  return out;
};

export const useFeedPrefs = create<FeedPrefsState>()(
  persist(
    (set, get) => ({
      hiddenListingIds: [],
      downweightedKeys: [],
      notInterestedReasons: {},
      downweightedSizes: [],
      priceCeilings: [],
      dismissedModuleIds: [],
      moduleImpressions: {},
      moduleEngagements: {},
      hideListing: (id) =>
        set((s) =>
          s.hiddenListingIds.includes(id)
            ? s
            : { hiddenListingIds: [...s.hiddenListingIds, id] },
        ),
      unhideListing: (id) =>
        set((s) => ({
          hiddenListingIds: s.hiddenListingIds.filter((x) => x !== id),
        })),
      downweightKey: (key) => {
        const normalized = key.trim().toLowerCase();
        if (!normalized) return;
        set((s) =>
          s.downweightedKeys.includes(normalized)
            ? s
            : { downweightedKeys: [...s.downweightedKeys, normalized] },
        );
      },
      unDownweightKey: (key) => {
        const normalized = key.trim().toLowerCase();
        if (!normalized) return;
        set((s) => ({
          downweightedKeys: s.downweightedKeys.filter((k) => k !== normalized),
        }));
      },
      applyNotInterestedReason: (listing, reason) => {
        // Record the reason first — even 'seen_it' (which dampens nothing,
        // honestly: already-seen isn't a taste signal) is kept as feedback
        // context on the hide.
        set((s) => ({
          notInterestedReasons: { ...s.notInterestedReasons, [listing.id]: reason },
        }));
        const category = listing.category?.trim().toLowerCase() ?? '';
        switch (reason) {
          case 'not_my_style': {
            // Style signal = the piece's look facets — brand first (the
            // strongest identity), then subcategory, then category as the
            // fallback when neither exists.
            const keys = [
              listing.brand?.trim().toLowerCase() ?? '',
              listing.subcategory?.trim().toLowerCase() ?? '',
            ].filter(Boolean);
            if (keys.length === 0 && category) keys.push(category);
            for (const k of keys) get().downweightKey(k);
            break;
          }
          case 'wrong_size': {
            const size = listing.size?.trim().toLowerCase() ?? '';
            if (!category || !size) break;
            set((s) =>
              s.downweightedSizes.some((x) => x.category === category && x.size === size)
                ? s
                : { downweightedSizes: [...s.downweightedSizes, { category, size }] },
            );
            break;
          }
          case 'too_expensive': {
            const price = listing.price;
            if (!category || typeof price !== 'number' || !Number.isFinite(price)) break;
            set((s) => ({
              // The lowest stated ceiling per category wins — it's the
              // strongest price signal the user gave.
              priceCeilings: [
                ...s.priceCeilings.filter((x) => x.category !== category),
                { category, maxPrice: Math.min(price, s.priceCeilings.find((x) => x.category === category)?.maxPrice ?? price) },
              ],
            }));
            break;
          }
          case 'seen_it':
            break;
        }
      },
      dismissModule: (id) => {
        const normalized = id.trim();
        if (!normalized) return;
        set((s) =>
          s.dismissedModuleIds.includes(normalized)
            ? s
            : { dismissedModuleIds: [...s.dismissedModuleIds, normalized] },
        );
      },
      undismissModule: (id) =>
        set((s) => ({
          dismissedModuleIds: s.dismissedModuleIds.filter((x) => x !== id),
          // Undo also re-arms the fatigue channel — a restored module
          // that immediately re-fatigued would make Undo feel broken.
          moduleImpressions: { ...s.moduleImpressions, [id]: 0 },
        })),
      noteModuleImpression: (id) => {
        const normalized = id.trim();
        if (!normalized) return;
        set((s) => ({
          moduleImpressions: {
            ...s.moduleImpressions,
            [normalized]: (s.moduleImpressions[normalized] ?? 0) + 1,
          },
        }));
      },
      noteModuleEngagement: (id) => {
        const normalized = id.trim();
        if (!normalized) return;
        set((s) => ({
          moduleEngagements: {
            ...s.moduleEngagements,
            [normalized]: (s.moduleEngagements[normalized] ?? 0) + 1,
          },
        }));
      },
    }),
    {
      name: 'thryftverse.web.feedprefs.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        hiddenListingIds: s.hiddenListingIds,
        downweightedKeys: s.downweightedKeys,
        notInterestedReasons: s.notInterestedReasons,
        downweightedSizes: s.downweightedSizes,
        priceCeilings: s.priceCeilings,
        dismissedModuleIds: s.dismissedModuleIds,
        moduleImpressions: s.moduleImpressions,
        moduleEngagements: s.moduleEngagements,
      }),
      // v2 added the reason record + derived facet dampens; v3 adds module
      // dismissal/fatigue. The migrate is defensive: each field passes
      // through only when its shape is provably right, so a corrupted or
      // older payload can never wedge the store — they simply yield empty
      // module/fatigue state.
      version: 3,
      migrate: (persisted): FeedPrefsState => {
        const old = persisted as Partial<FeedPrefsState> | undefined;
        const base = old && typeof old === 'object' ? old : {};
        return {
          hiddenListingIds: Array.isArray(base.hiddenListingIds)
            ? base.hiddenListingIds
            : [],
          downweightedKeys: Array.isArray(base.downweightedKeys)
            ? base.downweightedKeys
            : [],
          notInterestedReasons: cleanReasons(base.notInterestedReasons),
          downweightedSizes: cleanSizes(base.downweightedSizes),
          priceCeilings: cleanCeilings(base.priceCeilings),
          dismissedModuleIds: cleanStringArray(base.dismissedModuleIds),
          moduleImpressions: cleanCountMap(base.moduleImpressions),
          moduleEngagements: cleanCountMap(base.moduleEngagements),
        } as FeedPrefsState;
      },
    },
  ),
);

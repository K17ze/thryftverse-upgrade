/**
 * Identity department — supplemental design dataset.
 * Board contents and saved collections that the shared fixtures don't model
 * (MOODBOARDS carries covers + counts only; collections aren't represented).
 * Co-located with the profile surfaces per department file ownership —
 * promote to src/lib/data/fixtures-identity.ts if another surface needs it.
 */

import type { Listing } from '@/lib/contracts/domain';
import { listingById, MOODBOARDS } from '@/lib/data/fixtures';

/** Listing ids composing each fixture moodboard (length matches itemCount). */
export const MOODBOARD_ITEM_IDS: Record<string, string[]> = {
  // Autumn capsule — coats, knitwear, tailoring. 12 items.
  mb1: ['l9', 'l23', 'l14', 'l1', 'l26', 'l21', 'l12', 'l6', 'l7', 'l15', 'l5', 'l18'],
  // Grails — investment pieces. 5 items.
  mb2: ['l8', 'l4', 'l28', 'l17', 'l10'],
};

/** Decorative collaborator rows on own boards. */
export const MOODBOARD_COLLABORATOR_IDS: Record<string, string[]> = {
  mb1: ['u6', 'u1'],
  mb2: ['u3'],
};

export interface SavedCollection {
  id: string;
  title: string;
  itemIds: string[];
  createdAt: string;
}

/** Saved-item collections — groupings of bookmarked listings. */
export const COLLECTIONS: SavedCollection[] = [
  {
    id: 'col-tailoring',
    title: 'Tailoring',
    itemIds: ['l15', 'l26', 'l3', 'l18', 'l20'],
    createdAt: '2026-09-02T10:00:00Z',
  },
  {
    id: 'col-rotation',
    title: 'Summer rotation',
    itemIds: ['l6', 'l12', 'l21', 'l27', 'l16', 'l11'],
    createdAt: '2026-08-18T10:00:00Z',
  },
  {
    id: 'col-watchlist',
    title: 'Designer watchlist',
    itemIds: ['l8', 'l28', 'l25', 'l17', 'l10', 'l19'],
    createdAt: '2026-09-20T10:00:00Z',
  },
];

/**
 * Join-date record keyed by user id — User carries no createdAt, so the
 * hero's "member since" line reads tenure from here (never fabricated).
 */
export const USER_MEMBER_SINCE: Record<string, string> = {
  u1: '2019-03-14T10:00:00Z',
  u2: '2021-06-02T10:00:00Z',
  u3: '2018-11-21T10:00:00Z',
  u4: '2024-02-11T10:00:00Z',
  u5: '2017-05-08T10:00:00Z',
  u6: '2020-09-19T10:00:00Z',
  me: '2022-01-26T10:00:00Z',
};

/**
 * Profile boards — closet collections owned by a member, surfaced on their
 * profile. 'collection' routes to /collection/[id]; 'moodboard' routes to
 * /moodboard/[id]. Private boards are owner-only.
 */
export interface ProfileBoard {
  id: string;
  ownerId: string;
  title: string;
  kind: 'collection' | 'moodboard';
  itemIds: string[];
  coverUri?: string;
  isPrivate?: boolean;
  createdAt?: string;
}

/**
 * Public-facing collections shown on /u/[username] (plus one private board
 * on the owner's profile). Mirrors the mobile closet-collection surface.
 */
export const PROFILE_COLLECTIONS: ProfileBoard[] = [
  {
    id: 'col-denim-archive',
    ownerId: 'u5',
    title: 'Denim archive',
    kind: 'collection',
    itemIds: ['l5', 'l16', 'l20', 'l7'],
    createdAt: '2026-09-12T10:00:00Z',
  },
  {
    id: 'col-runway-rotation',
    ownerId: 'u5',
    title: 'Runway rotation',
    kind: 'collection',
    itemIds: ['l26', 'l23', 'l9'],
    isPrivate: true,
    createdAt: '2026-09-06T10:00:00Z',
  },
  {
    id: 'col-grail-pairs',
    ownerId: 'u3',
    title: 'Grail pairs',
    kind: 'collection',
    itemIds: ['l4', 'l13', 'l24'],
    createdAt: '2026-09-18T10:00:00Z',
  },
  {
    id: 'col-silk-evening',
    ownerId: 'u6',
    title: 'Silk & evening',
    kind: 'collection',
    itemIds: ['l6', 'l21', 'l12', 'l19'],
    createdAt: '2026-09-14T10:00:00Z',
  },
  {
    id: 'col-designer-bags',
    ownerId: 'u1',
    title: 'Designer bags',
    kind: 'collection',
    itemIds: ['l8', 'l28', 'l25'],
    createdAt: '2026-09-08T10:00:00Z',
  },
  {
    id: 'col-workwear',
    ownerId: 'u2',
    title: 'Workwear staples',
    kind: 'collection',
    itemIds: ['l3', 'l15', 'l18'],
    createdAt: '2026-08-30T10:00:00Z',
  },
  {
    id: 'col-gift-ideas',
    ownerId: 'me',
    title: 'Gift ideas',
    kind: 'collection',
    itemIds: ['l10', 'l25', 'l17'],
    isPrivate: true,
    createdAt: '2026-09-22T10:00:00Z',
  },
];

/**
 * Every board shown on an owner's profile — moodboards and saved
 * collections merged into one grid model. `includePrivate` is true only
 * for the profile owner.
 */
export function boardsForOwner(ownerId: string, includePrivate = false): ProfileBoard[] {
  const boards: ProfileBoard[] = [
    ...MOODBOARDS.filter((b) => b.ownerId === ownerId).map((b) => ({
      id: b.id,
      ownerId: b.ownerId,
      title: b.title,
      kind: 'moodboard' as const,
      itemIds: MOODBOARD_ITEM_IDS[b.id] ?? [],
      coverUri: b.coverUri,
      createdAt: b.createdAt,
    })),
    // Saved collections are the member's own boards today.
    ...(ownerId === 'me'
      ? COLLECTIONS.map((c) => ({
          id: c.id,
          ownerId,
          title: c.title,
          kind: 'collection' as const,
          itemIds: c.itemIds,
          createdAt: c.createdAt,
        }))
      : []),
    ...PROFILE_COLLECTIONS.filter((b) => b.ownerId === ownerId),
  ];
  return boards.filter((b) => includePrivate || !b.isPrivate);
}

export function collectionById(id: string): SavedCollection | ProfileBoard | undefined {
  return COLLECTIONS.find((c) => c.id === id) ?? PROFILE_COLLECTIONS.find((c) => c.id === id);
}

/** Resolve fixture listing ids → listings, dropping misses. */
export function listingsForIds(ids: string[]): Listing[] {
  return ids
    .map((id) => listingById(id))
    .filter((l): l is Listing => Boolean(l));
}

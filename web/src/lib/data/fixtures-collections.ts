/**
 * Collections-department fixtures — the user's saved collections and the
 * curated/editorial collections rail. Shapes mirror the mobile contracts:
 *  - UserCollection  → frontend/src/services/collectionsApi.ts `Collection`
 *  - CuratedCollection → GalleriaCollection / CuratedCollectionsRail cards
 *
 * The user's boards seed from the identity department's COLLECTIONS fixture
 * (single source for itemIds) and extend it with the privacy + timestamps the
 * collections surface needs.
 */

import { userById } from '@/lib/data/fixtures';
import { COLLECTIONS } from '@/components/profile/fixtures';

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// ============================================================================
// USER COLLECTIONS — mirrors mobile Collection { id, name, description,
// isPrivate, itemIds, createdAt, updatedAt }
// ============================================================================

export interface UserCollection {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Privacy per seeded board — the identity fixture doesn't model it. */
const SEED_PRIVACY: Record<string, boolean> = {
  'col-tailoring': false,
  'col-rotation': false,
  'col-watchlist': true,
};

export const USER_COLLECTION_SEED: UserCollection[] = COLLECTIONS.map((c) => ({
  id: c.id,
  name: c.title,
  description: null,
  isPrivate: SEED_PRIVACY[c.id] ?? false,
  itemIds: [...c.itemIds],
  createdAt: c.createdAt,
  updatedAt: c.createdAt,
}));

/**
 * The collection detail route (/collection/[id]) resolves boards through the
 * identity department's COLLECTIONS array — mirror any collection it doesn't
 * know about (extra seeds, session-created boards) so every id stays
 * addressable for the whole client session. Idempotent; a hard reload re-seeds.
 */
export function ensureCollectionResolvable(c: UserCollection): void {
  if (!COLLECTIONS.some((x) => x.id === c.id)) {
    COLLECTIONS.push({
      id: c.id,
      title: c.name,
      itemIds: [...c.itemIds],
      createdAt: c.createdAt,
    });
  }
}

USER_COLLECTION_SEED.forEach(ensureCollectionResolvable);

// ============================================================================
// CURATED COLLECTIONS — editorial boards authored by members. Rendered as
// large cover cards; opening one shows the edit in a sheet (same interaction
// as the Galleria collections).
// ============================================================================

export interface CuratedCollection {
  id: string;
  title: string;
  /** One-line editorial dek. */
  dek: string;
  /** Theme kicker shown over the cover (mobile GalleriaCollection.theme). */
  theme: string;
  /** Curator — resolves through USERS for avatar + verified. */
  curatorId: string;
  coverUri: string;
  itemIds: string[];
  publishedAt: string;
}

export const CURATED_COLLECTIONS: CuratedCollection[] = [
  {
    id: 'cur-archive',
    title: 'The archive rail',
    dek: 'Margiela-era minimalism and the tailoring that built it.',
    theme: 'Archive',
    curatorId: 'u5',
    coverUri: img('photo-1441984904996-e0b6ba687e04'),
    itemIds: ['l5', 'l7', 'l16', 'l20', 'l23', 'l26'],
    publishedAt: '2026-09-22T10:00:00Z',
  },
  {
    id: 'cur-rotation',
    title: 'The rotation',
    dek: 'Grails and daily beaters, legit-checked and laced up.',
    theme: 'Sneakers',
    curatorId: 'u3',
    coverUri: img('photo-1556906781-9a412961c28c'),
    itemIds: ['l4', 'l10', 'l11', 'l13', 'l24', 'l27'],
    publishedAt: '2026-09-19T10:00:00Z',
  },
  {
    id: 'cur-knitwear',
    title: 'Knitwear, graded',
    dek: 'Cashmere, silk and wool in the tones that whisper.',
    theme: 'Designer',
    curatorId: 'u1',
    coverUri: img('photo-1576871337622-98d48d1cf531'),
    itemIds: ['l1', 'l8', 'l14', 'l17', 'l25', 'l28'],
    publishedAt: '2026-09-15T10:00:00Z',
  },
  {
    id: 'cur-vintage',
    title: 'Bias cuts & slips',
    dek: 'Vintage dresses with a second life still ahead.',
    theme: 'Vintage',
    curatorId: 'u6',
    coverUri: img('photo-1490481651871-ab68de25d43d'),
    itemIds: ['l6', 'l9', 'l12', 'l19', 'l21'],
    publishedAt: '2026-09-10T10:00:00Z',
  },
];

export function curatedById(id: string): CuratedCollection | undefined {
  return CURATED_COLLECTIONS.find((c) => c.id === id);
}

export function curatorFor(c: CuratedCollection) {
  return userById(c.curatorId) ?? null;
}

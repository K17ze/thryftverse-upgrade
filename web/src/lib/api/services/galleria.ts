/**
 * Web galleria service — mirrors frontend/src/services/galleriaApi.ts.
 * Maps the API contract onto the web editorial model (fixtures-media
 * types) so the magazine surfaces render real curated content in live
 * mode and nothing is fabricated.
 *
 * Contract notes:
 *  - `/galleria/collections` items carry `itemIds` — collection-item row
 *    ids, NOT listing ids. Web cards only use them for the piece count.
 *  - Collection detail items carry an optional `listingId` — the only
 *    real link to a shoppable PDP. Items without one render as editorial
 *    cards (title + valuation + story), never as fake listings.
 *  - All /galleria/* endpoints require auth — guests get a sign-in gate,
 *    not a fabricated landing.
 */

import { fetchJson } from '../http';
import type {
  GalleriaEditorial,
  GalleriaFeaturedCollection,
} from '@/lib/data/fixtures-media';

// ── Wire shapes (backend/api/src/routes/galleria.ts mappers) ─────────────────

interface ApiCollection {
  id: string;
  title: string;
  subtitle: string;
  curator: string;
  curatorAvatar: string;
  coverImage: string;
  theme: string;
  publishedAt: string;
  itemIds: string[];
}

export interface ApiGalleriaItem {
  id: string;
  title: string;
  valuation: number;
  image: string;
  collection: string;
  story: string;
  aspectRatio: number;
  listingId?: string;
}

interface ApiEditorial {
  id: string;
  title: string;
  excerpt: string;
  heroImageUrl: string;
  authorName: string;
  authorAvatar: string;
  publishedAt: string;
  readTimeMinutes: number;
  bodyContent: string[];
  theme: string;
}

// ── Mapping ─────────────────────────────────────────────────────────────────

/** The API has no issue numbering — the masthead tag derives from the
 *  piece's own publish date ("October 2026"), never a fabricated "Issue 04". */
function issueLabelFor(publishedAt: string): string {
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return 'Editorial';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function mapCollection(raw: ApiCollection): GalleriaFeaturedCollection {
  return {
    id: raw.id,
    title: raw.title,
    dek: raw.subtitle,
    coverUri: raw.coverImage,
    // The API carries no cover aspect — the rail's authored 4/5 grammar is
    // a layout choice, not data.
    aspectRatio: 4 / 5,
    // Item-row ids — only ever used for the "N pieces" count. Resolving
    // real listings goes through the collection detail's listingId field.
    listingIds: raw.itemIds ?? [],
    theme: raw.theme || 'Collection',
    curator: {
      name: raw.curator || 'ThryftVerse',
      role: 'Curator',
      avatarUri: raw.curatorAvatar || '',
    },
    publishedAt: raw.publishedAt,
  };
}

function mapEditorial(raw: ApiEditorial): GalleriaEditorial {
  return {
    id: raw.id,
    issueLabel: issueLabelFor(raw.publishedAt),
    kicker: raw.theme || 'Editorial',
    title: raw.title,
    dek: raw.excerpt,
    heroUri: raw.heroImageUrl,
    author: {
      name: raw.authorName || 'Galleria',
      role: 'Editorial desk',
      avatarUri: raw.authorAvatar || '',
    },
    publishedAt: raw.publishedAt,
    readMinutes: raw.readTimeMinutes,
    body: raw.bodyContent ?? [],
    // Editorials carry no listing linkage in the API — the "Shop the story"
    // rail stays empty rather than pinning unrelated listings.
    listingIds: [],
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/** GET /galleria/collections — published curated edits, newest first. */
export async function fetchGalleriaCollections(
  signal?: AbortSignal,
): Promise<GalleriaFeaturedCollection[]> {
  const payload = await fetchJson<{ items: ApiCollection[] }>(
    '/galleria/collections?limit=24',
    undefined,
    { signal },
  );
  return (payload.items ?? []).map(mapCollection);
}

/** GET /galleria/editorials — published stories, newest first. */
export async function fetchGalleriaEditorials(
  signal?: AbortSignal,
): Promise<GalleriaEditorial[]> {
  const payload = await fetchJson<{ items: ApiEditorial[] }>(
    '/galleria/editorials?limit=24',
    undefined,
    { signal },
  );
  return (payload.items ?? []).map(mapEditorial);
}

/** GET /galleria/collections/:id — collection + its item rows. */
export async function fetchGalleriaCollection(
  id: string,
  signal?: AbortSignal,
): Promise<{ collection: GalleriaFeaturedCollection; items: ApiGalleriaItem[] } | null> {
  const payload = await fetchJson<{ collection?: ApiCollection; items?: ApiGalleriaItem[] }>(
    `/galleria/collections/${encodeURIComponent(id)}`,
    undefined,
    { signal },
  );
  if (!payload.collection) return null;
  return {
    collection: mapCollection(payload.collection),
    items: (payload.items ?? []).map((i) => ({
      ...i,
      collection: payload.collection!.title,
    })),
  };
}

/** GET /galleria/editorials/:id — one story for the reader route.
 *  A 404 means unpublished/moved — callers render "not found", not a
 *  substitute article. */
export async function fetchGalleriaEditorial(
  id: string,
  signal?: AbortSignal,
): Promise<GalleriaEditorial | null> {
  const payload = await fetchJson<{ editorial?: ApiEditorial }>(
    `/galleria/editorials/${encodeURIComponent(id)}`,
    undefined,
    { signal },
  );
  return payload.editorial ? mapEditorial(payload.editorial) : null;
}

/** Featured pieces for the hub grid — pulls the newest collections'
 *  details and surfaces items that link to real listings. Items without a
 *  listingId are still shoppable-looking media, so only listing-backed
 *  pieces are returned (mirrors mobile fetchFeaturedAssets). */
export async function fetchGalleriaFeaturedAssets(
  signal?: AbortSignal,
): Promise<{ item: ApiGalleriaItem; collectionTitle: string }[]> {
  const { items: collections } = await fetchJson<{ items: ApiCollection[] }>(
    '/galleria/collections?limit=6',
    undefined,
    { signal },
  );
  const details = await Promise.all(
    (collections ?? [])
      .slice(0, 4)
      .map((c) =>
        fetchJson<{ collection?: ApiCollection; items?: ApiGalleriaItem[] }>(
          `/galleria/collections/${encodeURIComponent(c.id)}`,
          undefined,
          { signal },
        ).catch(() => null),
      ),
  );
  const out: { item: ApiGalleriaItem; collectionTitle: string }[] = [];
  for (const detail of details) {
    if (!detail?.collection) continue;
    for (const item of (detail.items ?? []).slice(0, 2)) {
      if (item.listingId) {
        out.push({ item, collectionTitle: detail.collection.title });
      }
    }
  }
  return out;
}

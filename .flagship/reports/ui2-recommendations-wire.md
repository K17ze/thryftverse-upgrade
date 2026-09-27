# UI2 — Recommendations wire contract repair

**Date:** 2026-09-30
**Scope:** `backend/api/src/routes/recommendations.ts`, `backend/api/src/__tests__/recommendationSuppressionUndo.test.ts`
**Frontend:** `frontend/src/services/listingMapper.ts` (read-only, unchanged)

## Verdict: real dead-end — confirmed, no missed transform

Traced end-to-end. `GET /recommendations/:userId` built `items[].listing` by
spreading the raw `ListingRow` (snake_case) onto the wire
(`recommendations.ts`, previously ~line 1508: `listing,`). On the client,
`useForYouFeed.mapResponseToPage` (`frontend/src/hooks/useForYouFeed.ts:91`)
feeds `item.listing` **directly** into `mapBackendListingToListing` — there is
no adapter, fetcher normalization, or case-transform anywhere in between. The
mapper reads camelCase only (`priceGbp`, `sellerId`, `createdAt`, `imageUrl`,
`mediaAspectRatio`, …), so every For-You row mapped to `price: null`,
`sellerId: null`, `createdAt: null` → `isDisplayReadyListing` (`listingMapper.ts:290`)
returned false → all items dropped in `mapResponseToPage` → `forYouFeed.listings`
permanently empty → `useDiscoveryFeed`/`useForYouFeed` silently fell back to the
generic listings cursor. The whole personalization pipeline (decision service,
reranking, intent directives, suppression) was dead on the client while
`id`-only assertions kept tests green.

## Changes

### 1. `items[].listing` serialized to the camelCase API contract

New `toApiListing(row: ListingRow)` serializer in `recommendations.ts`
(after `fallbackDecision`, ~line 383). It projects only fields the row
actually carries — nothing fabricated:

| Wire field | Source |
|---|---|
| `id`, `sellerId`, `title`, `description` | direct |
| `category`, `subcategory`, `brand`, `size`, `condition` | direct |
| `priceGbp` | `Number(price_gbp)` |
| `originalPriceGbp` | `Number(original_price_gbp)`, null-preserving |
| `imageUrl`, `status`, `createdAt` | direct |
| `mediaWidth`, `mediaHeight`, `mediaAspectRatio` | primary-image join (below); aspect = width/height per feed.ts:897 convention, only when both known |
| `seller` | `{ id: seller_id, rating: Number(seller_rating) \| null, responseHours: Number(seller_response_hours) \| null }` |

Applied at the `items` build (~line 1570): `listing: toApiListing(listing)`.
The decision-service candidate payload (`listing_id`, `price_gbp`, … at
~line 1375) is a separate snake_case ML contract and was deliberately left
unchanged.

### 2. Candidate SQL now projects `status`, `subcategory`, `original_price_gbp` + media geometry

`candidateListingsSql` SELECT extended (all real columns — migrations 031,
310; `index.ts:16845` already selects them plainly):

- `l.status` — the mapper normalizes lifecycle (`isSold`, commerce actions);
  previously it would have read `undefined` → `'unknown'`.
- `l.subcategory` — feeds `resolveListingCategoryPolicy(category,
  subcategory)`; a missing subcategory can mis-resolve brandless/sizeless
  policy and re-create the same silent-drop class this fix removes.
- `l.original_price_gbp::text` — strike-through pricing on cards.

New `LEFT JOIN LATERAL` on `listing_images` picks the primary image per
listing (`ORDER BY li.sort_order ASC, li.created_at, li.id LIMIT 1` —
deterministic, mirroring `listingMediaProjection.ts` ordering) and projects:

```sql
NULLIF(to_jsonb(li) ->> 'media_width', '')::integer AS media_width,
NULLIF(to_jsonb(li) ->> 'media_height', '')::integer AS media_height
```

The `to_jsonb` read (same pattern as `listingMediaProjection.ts:115-116`)
keeps the query valid on pre-055 schemas — columns project as NULL instead
of erroring. `media_width`/`media_height` added to `ListingRow`.

### 3. Test updates — `recommendationSuppressionUndo.test.ts`

- Local `ListingRow` fixture type + `listing()` factory extended with
  `status`, `subcategory`, `original_price_gbp`, `media_width: 800`,
  `media_height: 1000`.
- `serve()` return type widened to `{ id: string } & Record<string, unknown>`.
- New describe block **"wire contract — items[].listing is serialized to the
  camelCase API shape"** with three tests:
  - camelCase presence: `sellerId`, `priceGbp === 42`, `imageUrl`,
    `createdAt`, `status`, `seller === {id, rating: null, responseHours: null}`;
    snake_case absence: `image_url`, `price_gbp`, `seller_id`, `created_at`
    (regression guard).
  - geometry: `mediaWidth 800`, `mediaHeight 1000`, `mediaAspectRatio 0.8`.
  - `mediaAspectRatio: null` when geometry is unknown.
- Scripted-Pool matchers reviewed — they dispatch on `text.includes(...)`
  fragments (`FROM listings l`, `array_position`, `LOWER(l.category)`,
  `user_follows`, `ORDER BY COALESCE`). The new `FROM listing_images li`
  subquery and `ORDER BY li.sort_order` collide with none of them; no
  matcher update needed.
- `retrievalSourceContract.test.ts` (source-regex assertions) also reviewed —
  `candidateListingsSql(` call count and all regexes still satisfied.

## Verification

```
cd backend/api
npx tsc --noEmit                                        # clean
npx vitest run src/__tests__/recommendationSuppressionUndo.test.ts
# 24/24 passed
node --import tsx --test src/__tests__/recommendationReranking.test.ts \
     src/__tests__/retrievalSourceContract.test.ts src/routes/recommendations.test.ts
# 16/16 passed
```

## Residual notes

- `seller_rating` is still shadow-mode NULL (seller_ratings CTE emits
  `NULL::text`), so `seller.rating` is null on the wire today — honest, and
  the field lights up automatically when the calibrated feature ships.
- `images[]`/`media[]` are not projected (route has no `loadListingMedia`
  call); the mapper falls back to `[imageUrl]`. Out of scope — masonry only
  needs `mediaAspectRatio`, which is now served.
